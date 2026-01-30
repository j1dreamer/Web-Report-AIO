from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

# Lấy connection string từ .env, mặc định là chạy local
MONGO_DETAILS = os.getenv("MONGO_URL", "mongodb://localhost:27017")

client = AsyncIOMotorClient(MONGO_DETAILS)
database = client.hpe_reports

# Collections
reports_collection = database.get_collection("records")
files_collection = database.get_collection("processed_files")
users_collection = database.get_collection("users")

async def init_mongo_indexes():
    """Tạo indexes để tìm kiếm nhanh"""
    # Index cho việc tìm kiếm biểu đồ
    await reports_collection.create_index([("dt_obj", 1), ("site", 1), ("device", 1)])
    # Index cho việc tra cứu file đã xử lý
    await files_collection.create_index("filename", unique=True)
    # Index cho user
    await users_collection.create_index("username", unique=True)
    print("MongoDB Indexes created.")
