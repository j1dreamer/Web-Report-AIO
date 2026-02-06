import sys
import os
import boto3
import asyncio
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from engine import AnalyzerEngine
from database_mongo import init_mongo_indexes, users_collection, files_collection, settings_collection
from auth import verify_password, get_password_hash, create_access_token, decode_token

app = FastAPI(title="HPE Report Analyzer API")
backend = AnalyzerEngine()
security = HTTPBearer()

# --- Global Sync Status ---
sync_status = {
    "is_syncing": False,
    "current_step": "Idle",
    "files_total": 0,
    "files_done": 0,
    "last_message": "Ready"
}

# --- Auth Dependencies ---
async def get_current_user(auth: HTTPAuthorizationCredentials = Security(security)):
    payload = decode_token(auth.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await users_collection.find_one({"username": payload.get("sub")})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    user["_id"] = str(user["_id"])
    return user

def admin_only(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# --- Models ---
class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"
    allowed_sites: List[str] = []

class UserUpdate(BaseModel):
    role: Optional[str]
    allowed_sites: Optional[List[str]]
    password: Optional[str] = None

class DashboardConfig(BaseModel):
    config: List[dict]

class FilterRequest(BaseModel):
    site: Optional[str] = "All Sites"
    device: Optional[str] = "All Devices"
    metric: Optional[str] = "clients"
    chart_type: Optional[str] = "area"
    hours: Optional[int] = None

# --- Startup ---
@app.on_event("startup")
async def startup_event():
    await init_mongo_indexes()
    admin_exists = await users_collection.find_one({"role": "admin"})
    if not admin_exists:
        admin_user = {
            "username": "admin",
            "password": get_password_hash("admin123"),
            "role": "admin",
            "allowed_sites": []
        }
        await users_collection.insert_one(admin_user)
        print("Default admin created: admin / admin123")
    
    count = await backend.get_total_records_count()
    print(f"Startup: MongoDB connected with {count} records.")

# --- R2 Helpers ---
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
DATA_FOLDER_PREFIX = os.getenv("DATA_FOLDER_PREFIX", "")

def get_r2_client():
    if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY]): return None
    return boto3.client("s3", 
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto"
    )

async def fetch_r2_files():
    global sync_status
    client = get_r2_client()
    if not client: 
        sync_status["last_message"] = "Invalid R2 Credentials"
        return []
    
    sync_status["is_syncing"] = True
    sync_status["current_step"] = "Scanning Cloudflare R2..."
    sync_status["files_done"] = 0
    
    # 1. Lấy danh sách file đã xử lý từ DB
    processed = await files_collection.distinct("filename")
    processed_set = set(processed)
    
    # 2. Liệt kê file trên R2
    paginator = client.get_paginator('list_objects_v2')
    pages = await asyncio.to_thread(lambda: list(paginator.paginate(Bucket=R2_BUCKET_NAME, Prefix=DATA_FOLDER_PREFIX)))
    
    to_download = []
    for page in pages:
        for obj in page.get('Contents', []):
            key = obj['Key']
            fname = os.path.basename(key)
            if key.endswith('/') or not (key.lower().endswith('.csv') or key.lower().endswith('.xlsx')): continue
            if fname in processed_set: continue
            to_download.append(key)
    
    if not to_download:
        sync_status["is_syncing"] = False
        sync_status["current_step"] = "Idle"
        sync_status["last_message"] = "Everything is up to date"
        return []

    sync_status["files_total"] = len(to_download)
    sync_status["current_step"] = f"Downloading {len(to_download)} new files..."

    # 3. Tải các file mới song song (giới hạn 50 file cùng lúc để tránh quá tải mạng)
    semaphore = asyncio.Semaphore(50)
    
    async def download_one_safe(key):
        async with semaphore:
            try:
                resp = await asyncio.to_thread(client.get_object, Bucket=R2_BUCKET_NAME, Key=key)
                data = (resp['Body'].read(), os.path.basename(key))
                sync_status["files_done"] += 1
                return data
            except Exception as e:
                print(f"Failed to download {key}: {e}")
                return None

    results = await asyncio.gather(*[download_one_safe(k) for k in to_download]) 
    return [r for r in results if r is not None]

# --- CORS ---
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- API Routes ---
@app.get("/api/settings")
async def get_settings():
    settings = await settings_collection.find_one({"type": "global"})
    if not settings:
        return {"enabled_metrics": ['clients', 'health', 'state']}
    return {"enabled_metrics": settings.get("enabled_metrics", ['clients', 'health', 'state'])}

@app.post("/api/admin/settings", dependencies=[Depends(admin_only)])
async def update_settings(data: dict):
    await settings_collection.update_one(
        {"type": "global"},
        {"$set": {"enabled_metrics": data.get("enabled_metrics", [])}},
        upsert=True
    )
    return {"message": "Settings updated"}

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    user = await users_collection.find_one({"username": req.username})
    if not user or not verify_password(req.password, user["password"]):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    token = create_access_token({"sub": user["username"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"username": user["username"], "role": user["role"], "allowed_sites": user.get("allowed_sites", [])}
    }

@app.get("/api/admin/users")
async def list_users(admin: dict = Depends(admin_only)):
    users = await users_collection.find({}, {"password": 0}).to_list(100)
    for u in users: u["_id"] = str(u["_id"])
    return users

@app.post("/api/admin/users")
async def create_user(req: UserCreate, admin: dict = Depends(admin_only)):
    if await users_collection.find_one({"username": req.username}):
        raise HTTPException(status_code=400, detail="User already exists")
    new_user = req.dict()
    new_user["password"] = get_password_hash(req.password)
    await users_collection.insert_one(new_user)
    return {"status": "success"}

@app.delete("/api/admin/users/{username}")
async def delete_user(username: str, admin: dict = Depends(admin_only)):
    if username == admin["username"]: raise HTTPException(status_code=400, detail="Self-delete failed")
    await users_collection.delete_one({"username": username})
    return {"status": "success"}

@app.put("/api/admin/users/{username}")
async def update_user(username: str, req: UserUpdate, admin: dict = Depends(admin_only)):
    update_data = {}
    if req.role is not None: update_data["role"] = req.role
    if req.allowed_sites is not None: update_data["allowed_sites"] = req.allowed_sites
    if req.password: update_data["password"] = get_password_hash(req.password)
    
    if not update_data: return {"status": "no change"}
    
    await users_collection.update_one({"username": username}, {"$set": update_data})
    return {"status": "success"}

@app.post("/api/user/dashboard")
async def save_dashboard(req: DashboardConfig, user: dict = Depends(get_current_user)):
    await users_collection.update_one({"username": user["username"]}, {"$set": {"dashboard": req.config}})
    return {"status": "success"}

@app.post("/api/load")
async def load_data(background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    global sync_status
    if user["role"] == "admin" and sync_status["is_syncing"]:
        # Trả về luôn nếu admin đang có sync chạy rồi
        return {
            "status": "warning",
            "message": "Sync already in progress...",
            "site_map": {"All Sites": ["All Devices"]},
            "dashboard": user.get("dashboard", []),
            "role": user["role"]
        }

    # 1. Trả về thông tin UI ngay lập tức
    if user["role"] == "admin":
        sites = await backend.get_sites()
    else:
        sites = user.get("allowed_sites", [])
    
    # Chỉ hiện "All Sites" nếu thực sự có từ 2 Site trở lên (cho cả Admin và User)
    show_all = len(sites) > 1
    
    site_map = {}
    if show_all:
        site_map["All Sites"] = ["All Devices"]
        
    for s in sites:
        site_map[s] = ["All Devices"] + await backend.get_devices(site=s)

    # Xác định Site mặc định cho Dashboard nếu user chưa có cấu hình
    default_site = "All Sites" if show_all else (sites[0] if sites else "Unknown")

    # Lấy dashboard cũ và lọc bỏ các site không còn quyền truy cập hoặc "All Sites" nếu bị ẩn
    raw_dashboard = user.get("dashboard", [])
    sanitized_dashboard = []
    
    for widget in raw_dashboard:
        w_site = widget.get("site")
        # Giữ lại nếu site đó nằm trong danh sách được phép hoặc (là All Sites và hệ thống cho phép hiện All Sites)
        if w_site in sites or (w_site == "All Sites" and show_all):
            sanitized_dashboard.append(widget)
        else:
            # Nếu widget bị sai site, tự động chuyển về site mặc định thay vì xóa bỏ
            widget["site"] = default_site
            widget["device"] = "All Devices"
            sanitized_dashboard.append(widget)

    if not sanitized_dashboard:
        sanitized_dashboard = [
            {"id": "default", "title": "Network Trend", "metric": "clients", "type": "area", "site": default_site, "device": "All Devices"}
        ]

    # 2. Chạy sync R2 trong background
    async def run_sync():
        global sync_status
        try:
            files = await fetch_r2_files()
            if files:
                sync_status["current_step"] = "Saving to Database..."
                new_count, skipped = await backend.load_multiple_from_memory(files)
                sync_status["last_message"] = f"Success! Added {new_count} records."
            else:
                if sync_status["last_message"] != "Invalid R2 Credentials":
                    sync_status["last_message"] = "No new data found on R2."
        except Exception as e:
            sync_status["last_message"] = f"Error: {str(e)}"
        finally:
            sync_status["is_syncing"] = False
            sync_status["current_step"] = "Idle"

    background_tasks.add_task(run_sync)
    
    # Lấy thống kê tổng quan (dynamic stats)
    summary = await backend.get_global_summary(allowed_sites=sites if user["role"] != "admin" else None)

    return {
        "status": "success",
        "message": "Syncing cloud files in background...",
        "site_map": site_map,
        "dashboard": sanitized_dashboard,
        "summary": summary,
        "role": user["role"]
    }

@app.post("/api/admin/inject-test-data")
async def inject_test_data(admin: dict = Depends(admin_only)):
    count = await backend.inject_test_data()
    return {"status": "success", "message": f"Injected {count} test records."}

@app.get("/api/sync-status")
async def get_sync_status(user: dict = Depends(get_current_user)):
    return sync_status

@app.post("/api/analyze")
async def analyze(req: FilterRequest, user: dict = Depends(get_current_user)):
    allowed = user.get("allowed_sites", []) if user["role"] == "user" else await backend.get_sites()
    if req.site != "All Sites" and req.site not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if req.site == "All Sites":
        df = await backend.filter_data_multiple(allowed, req.device, req.hours) if user["role"] == "user" else await backend.filter_data(req.site, req.device, req.hours)
    else:
        df = await backend.filter_data(req.site, req.device, req.hours)

    summary = None
    if req.metric == "clients":
        # Khi vẽ biểu đồ, tính kèm summary luôn
        # allow_sites_list lọc theo đúng request hoặc list được phép
        asl = [req.site] if req.site != "All Sites" else allowed
        summary = await backend.get_global_summary(allowed_sites=asl)

    if df.empty: return {"data": [], "summary": summary}

    # Dọn dẹp dữ liệu: Xóa khoảng trắng thừa để tránh trùng lặp do lỗi nhập liệu
    df['site'] = df['site'].astype(str).str.strip()
    df['device'] = df['device'].astype(str).str.strip()
    df['time_str'] = df['dt_obj'].dt.strftime("%Y-%m-%d %H:%M")

    result_data = []
    if req.metric == "clients":
        # 1. Lọc trùng: Lấy MAX nếu cùng Site, Device, Phút
        df_dedup = df.groupby(['site', 'device', 'time_str'])['clients'].max().reset_index()
        
        # 2. Nhóm theo thời gian: Cộng tổng clients của tất cả thiết bị trong phút đó
        chart_data = df_dedup.groupby('time_str')['clients'].sum().sort_index()
        result_data = [{"time": t, "clients": int(c)} for t, c in chart_data.items()]
    
    elif req.metric in ["health", "state"]:
        # Tương tự cho Health/State: Lấy bản ghi mới nhất/duy nhất của mỗi thiết bị trong phút đó
        df_dedup = df.sort_values('dt_obj').drop_duplicates(['site', 'device', 'time_str'], keep='last')
        dist = df_dedup[req.metric].value_counts()
        result_data = [{"name": str(label), "value": int(val)} for label, val in dist.items()]
    
    return {"data": result_data, "summary": summary}

@app.post("/api/admin/clear-sync-cache", dependencies=[Depends(admin_only)])
async def clear_sync_cache():
    await files_collection.delete_many({})
    return {"message": "Đã reset bộ nhớ đệm đồng bộ. Hệ thống sẽ quét lại toàn bộ file từ Cloud."}

@app.post("/api/admin/clear-test-data", dependencies=[Depends(admin_only)])
async def clear_test_data():
    count = await backend.clear_test_data()
    return {"message": f"Đã xóa {count} bản ghi dữ liệu test."}

@app.get("/api/summary")
async def get_summary(site: str = "All Sites", user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        allowed = await backend.get_sites()
    else:
        allowed = user.get("allowed_sites", [])
    
    if site != "All Sites":
        if site not in allowed:
            raise HTTPException(status_code=403, detail="Access denied")
        sites_to_calc = [site]
    else:
        sites_to_calc = allowed
        
    summary = await backend.get_global_summary(allowed_sites=sites_to_calc)
    return summary

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
