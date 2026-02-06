import pandas as pd
import os
import re
from datetime import datetime
from io import BytesIO
import asyncio
from database_mongo import reports_collection, files_collection, init_mongo_indexes

class AnalyzerEngine:
    def __init__(self):
        # Khởi tạo indexes khi engine được load
        pass

    async def load_multiple_from_memory(self, file_list):
        """Xử lý nhiều file và lưu vào MongoDB."""
        new_records_count = 0
        skipped_files = []
        
        for content, fname in file_list:
            # 1. Kiểm tra xem file đã được xử lý chưa
            existing = await files_collection.find_one({"filename": fname})
            if existing:
                continue
            
            try:
                file_source = BytesIO(content) if isinstance(content, bytes) else content
                records_data = self.process_file_data(file_source, fname)
                
                if records_data:
                    # 2. Insert toàn bộ records của file vào MongoDB
                    await reports_collection.insert_many(records_data)
                    
                    # 3. Đánh dấu file đã xử lý
                    await files_collection.insert_one({
                        "filename": fname,
                        "processed_at": datetime.utcnow()
                    })
                    new_records_count += len(records_data)
                else:
                    skipped_files.append(f"{fname} (No records)")
                    
            except Exception as e:
                print(f"Error processing {fname}: {e}")
                skipped_files.append(f"{fname} (Error)")

        print(f"Sync complete. Added {new_records_count} records to MongoDB.")
        return new_records_count, skipped_files

    def process_file_data(self, file_source, fname):
        """Logic phân tích file Excel/CSV thành list các dict cho MongoDB."""
        all_records = []
        date_time_pattern = re.compile(r"(\d{1,4}[-.\/]\d{1,2}[-.\/]\d{1,4})")
        time_pattern = re.compile(r"(\d{1,2}[h:]\d{1,2})")

        site_name = "Unknown"
        dt_obj = None

        date_match = date_time_pattern.search(fname)
        time_match = time_pattern.search(fname)

        if date_match and time_match:
            date_str = date_match.group(1).replace('.', '-').replace('/', '-')
            time_str = time_match.group(1).replace('h', ':')
            site_part = fname[:date_match.start()].strip(" -_")
            if site_part: site_name = site_part
            for fmt in ["%d-%m-%Y %H:%M", "%Y-%m-%d %H:%M"]:
                try:
                    dt_obj = datetime.strptime(f"{date_str} {time_str}", fmt)
                    break
                except: continue
        
        if not dt_obj:
            dt_obj = datetime.now()
            site_part = fname.split('-')[0].strip() if '-' in fname else "Unknown"
            if site_part and site_part != fname: site_name = site_part

        df = pd.read_csv(file_source) if fname.endswith('.csv') else pd.read_excel(file_source)
        df.columns = [str(c).strip().title() for c in df.columns] 
        
        for _, row in df.iterrows():
            dev = str(row.get("Device", row.get("Name", ""))).strip()
            if not dev or dev.lower() in ["device", "nan", ""]: continue
            
            try: client_count = int(float(row.get("Clients", 0)))
            except: client_count = 0
                
            all_records.append({
                "dt_obj": dt_obj,
                "site": site_name,
                "device": str(dev),
                "clients": client_count,
                "health": str(row.get("Health", "")),
                "state": str(row.get("State", "")),
                "model": str(row.get("Model", "")),
                "ip": str(row.get("Ip Address", "") or row.get("Ip", ""))
            })
        return all_records

    async def get_sites(self):
        sites = await reports_collection.distinct("site")
        return sorted(sites)

    async def get_devices(self, site=None):
        query = {"site": site} if site and site != "All Sites" else {}
        devices = await reports_collection.distinct("device", query)
        return sorted(devices)

    async def get_total_records_count(self):
        return await reports_collection.count_documents({})

    async def filter_data(self, site, device, hours=None):
        """Lấy dữ liệu từ MongoDB cho biểu đồ."""
        query = {}
        if site != "All Sites": query["site"] = site
        if device != "All Devices": query["device"] = device
        
        if hours:
            from datetime import timedelta
            # Lấy theo thời gian hiện tại trừ đi số giờ
            start_time = datetime.now() - timedelta(hours=hours)
            query["dt_obj"] = {"$gte": start_time}
        
        cursor = reports_collection.find(query, {"dt_obj": 1, "clients": 1, "health": 1, "state": 1, "site": 1, "device": 1, "_id": 0})
        records = await cursor.to_list(length=100000) # Lấy tối đa 100k bản ghi
        
        if not records: return pd.DataFrame()
        return pd.DataFrame(records)

    async def filter_data_multiple(self, sites, device, hours=None):
        """Lọc dữ liệu cho danh sách nhiều site cùng lúc (dùng cho User bình thường)."""
        query = {"site": {"$in": sites}}
        if device != "All Devices": query["device"] = device

        if hours:
            from datetime import timedelta
            start_time = datetime.now() - timedelta(hours=hours)
            query["dt_obj"] = {"$gte": start_time}
        
        cursor = reports_collection.find(query, {"dt_obj": 1, "clients": 1, "health": 1, "state": 1, "site": 1, "device": 1, "_id": 0})
        records = await cursor.to_list(length=100000)
        
        if not records: return pd.DataFrame()
        return pd.DataFrame(records)

    async def get_global_summary(self, allowed_sites=None):
        """Thống kê dựa trên 2000 bản ghi mới nhất trong hệ thống (Cực kỳ ổn định)."""
        query = {}
        if allowed_sites:
            query["site"] = {"$in": allowed_sites}
        
        # Lấy 2000 bản ghi gần đây nhất, sắp xếp theo thời gian giảm dần
        cursor = reports_collection.find(query).sort("dt_obj", -1).limit(2000)
        results = await cursor.to_list(length=2000)
        
        if not results:
            return {"connectivity": "0%", "alerts": 0, "total_clients": 0}
            
        # Group by Site + Device to get the LATEST state of each unique device
        latest_states = {}
        for r in results:
            site = r.get('site', 'Unknown')
            device = r.get('device', 'Unknown')
            key = f"{site}_{device}"
            
            # Vì đã sort theo dt_obj DESC, nên bản ghi đầu tiên của mỗi key chính là bản ghi mới nhất
            if key not in latest_states:
                latest_states[key] = r

        total_devs = len(latest_states)
        up_devs = 0
        total_alerts = 0
        total_clients = 0
        
        # Các trạng thái hoạt động tốt
        UP_STATES = ["up", "online", "connected", "good", "active", "normal", "stable", "1", "true"]

        for r in latest_states.values():
            state = str(r.get("state", "")).lower().strip()
            health_str = str(r.get("health", "100")).replace("%", "").strip()
            total_clients += (r.get("clients") or 0)
            
            is_up = state in UP_STATES
            if is_up: 
                up_devs += 1
            else: 
                total_alerts += 1
                
            try:
                health_val = float(health_str)
                if health_val < 70 and is_up: 
                    total_alerts += 1
            except: pass
            
        connectivity = (up_devs / total_devs * 100) if total_devs > 0 else 0
        
        return {
            "connectivity": f"{connectivity:.1f}%",
            "alerts": total_alerts,
            "total_clients": total_clients
        }

    async def inject_test_data(self):
        """Tạo dữ liệu giả lập để test giao diện."""
        from datetime import datetime, timedelta
        import random
        
        test_records = []
        now = datetime.now()
        sites = ["TEST_SITE_A", "TEST_SITE_B", "DEMO_LAB"]
        
        for site in sites:
            for i in range(5): # 5 devices per site
                dev_name = f"AP-{site.split('_')[0]}-{i+1}"
                # Tạo dữ liệu cho 24 giờ qua, mỗi giờ 1 bản ghi
                for h in range(24):
                    test_records.append({
                        "dt_obj": now - timedelta(hours=h),
                        "site": site,
                        "device": dev_name,
                        "clients": random.randint(5, 50),
                        "health": str(random.randint(80, 100)),
                        "state": "up",
                        "model": "AP-515",
                        "ip": f"192.168.{random.randint(1,254)}.{random.randint(1,254)}",
                        "is_test": True
                    })
        
        if test_records:
            await reports_collection.insert_many(test_records)
            return len(test_records)
        return 0

    async def clear_test_data(self):
        """Xóa tất cả dữ liệu được đánh dấu là dữ liệu test."""
        # Chỉ xóa những record thuộc các site ảo (dummy)
        test_sites = ["TEST_SITE_A", "TEST_SITE_B", "DEMO_LAB"]
        result = await reports_collection.delete_many({
            "$or": [
                {"is_test": True},
                {"site": {"$in": test_sites}}
            ]
        })
        return result.deleted_count
