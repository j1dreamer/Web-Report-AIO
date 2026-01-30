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
from database_mongo import init_mongo_indexes, users_collection
from auth import verify_password, get_password_hash, create_access_token, decode_token

app = FastAPI(title="HPE Report Analyzer API")
backend = AnalyzerEngine()
security = HTTPBearer()

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

class DashboardConfig(BaseModel):
    config: List[dict]

class FilterRequest(BaseModel):
    site: Optional[str] = "All Sites"
    device: Optional[str] = "All Devices"
    metric: Optional[str] = "clients"
    chart_type: Optional[str] = "area"

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

def fetch_r2_files():
    client = get_r2_client()
    if not client: return []
    paginator = client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=R2_BUCKET_NAME, Prefix=DATA_FOLDER_PREFIX)
    file_list = []
    for page in pages:
        for obj in page.get('Contents', []):
            key = obj['Key']
            if key.endswith('/') or not (key.lower().endswith('.csv') or key.lower().endswith('.xlsx')): continue
            response = client.get_object(Bucket=R2_BUCKET_NAME, Key=key)
            file_list.append((response['Body'].read(), os.path.basename(key)))
    return file_list

# --- CORS ---
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- API Routes ---
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

@app.post("/api/user/dashboard")
async def save_dashboard(req: DashboardConfig, user: dict = Depends(get_current_user)):
    await users_collection.update_one({"username": user["username"]}, {"$set": {"dashboard": req.config}})
    return {"status": "success"}

@app.post("/api/load")
async def load_data(background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    async def sync_with_r2():
        try:
            files = await asyncio.to_thread(fetch_r2_files)
            if files: await backend.load_multiple_from_memory(files)
        except Exception as e: print(f"Sync failed: {e}")

    background_tasks.add_task(sync_with_r2)
    
    # Allowed sites logic
    if user["role"] == "admin":
        sites = await backend.get_sites()
    else:
        sites = user.get("allowed_sites", [])
    
    site_map = {"All Sites": ["All Devices"]}
    for s in sites:
        site_map[s] = ["All Devices"] + await backend.get_devices(site=s)

    dashboard = user.get("dashboard", [
        {"id": "default", "title": "Network Trend", "metric": "clients", "type": "area", "site": "All Sites", "device": "All Devices"}
    ])

    return {
        "status": "success",
        "message": "Connected. Syncing cloud in background...",
        "site_map": site_map,
        "dashboard": dashboard,
        "role": user["role"]
    }

@app.post("/api/analyze")
async def analyze(req: FilterRequest, user: dict = Depends(get_current_user)):
    allowed = user.get("allowed_sites", []) if user["role"] == "user" else await backend.get_sites()
    if req.site != "All Sites" and req.site not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if req.site == "All Sites":
        df = await backend.filter_data_multiple(allowed, req.device) if user["role"] == "user" else await backend.filter_data(req.site, req.device)
    else:
        df = await backend.filter_data(req.site, req.device)

    if df.empty: return []

    if req.metric == "clients":
        chart_data = df.groupby('dt_obj')['clients'].sum().sort_index()
        return [{"time": dt.strftime("%Y-%m-%d %H:%M"), "clients": int(c)} for dt, c in chart_data.items()]
    elif req.metric in ["health", "state"]:
        dist = df[req.metric].value_counts()
        return [{"name": str(label), "value": int(val)} for label, val in dist.items()]
    return []

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
