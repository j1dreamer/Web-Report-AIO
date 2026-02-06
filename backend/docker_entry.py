import asyncio
import logging
from main import app, fetch_r2_files, backend, sync_status

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docker_entry")

async def auto_sync_loop():
    """
    Vòng lặp vĩnh cửu: Quét R2 mỗi 5 phút một lần để đảm bảo độ trễ dữ liệu thấp.
    """
    logger.info("Background auto-sync loop started.")
    while True:
        try:
            if not sync_status["is_syncing"]:
                logger.info("Auto-sync: Checking for new files on R2...")
                files = await fetch_r2_files()
                if files:
                    sync_status["current_step"] = "Saving to Database..."
                    new_count, skipped = await backend.load_multiple_from_memory(files)
                    sync_status["last_message"] = f"Auto-sync: Added {new_count} records."
                    logger.info(f"Auto-sync: Added {new_count} records.")
                else:
                    logger.info("Auto-sync: No new data.")
                
                # Reset status after successful loop iteration
                sync_status["is_syncing"] = False
                sync_status["current_step"] = "Idle"

        except Exception as e:
            logger.error(f"Auto-sync Loop Error: {e}")
            sync_status["is_syncing"] = False
            sync_status["current_step"] = "Idle"
            sync_status["last_message"] = f"Error: {str(e)}"
        
        # Đợi 5 phút (300 giây) rồi mới quét tiếp
        await asyncio.sleep(300)

@app.on_event("startup")
async def trigger_startup_sync():
    # Chạy vòng lặp đồng bộ trong background
    asyncio.create_task(auto_sync_loop())
