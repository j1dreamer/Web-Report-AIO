import asyncio
from database_mongo import reports_collection
from datetime import datetime

async def check():
    count = await reports_collection.count_documents({})
    print(f"DEBUG_DB_COUNT: {count}")
    
    latest = await reports_collection.find_one({}, sort=[("dt_obj", -1)])
    if latest:
        print(f"DEBUG_LATEST_SITE: {latest.get('site')}")
        print(f"DEBUG_LATEST_TIME: {latest.get('dt_obj')}")
        
        # Check specific field types
        print(f"DEBUG_FIELD_TYPES: { {k: type(v).__name__ for k,v in latest.items()} }")
    else:
        print("DEBUG_DB_EMPTY")

if __name__ == "__main__":
    asyncio.run(check())
