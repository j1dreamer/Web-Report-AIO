import asyncio
import logging
from main import app, fetch_r2_files, backend, sync_status

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docker_entry")

async def auto_sync_on_startup():
    """
    Automatically triggers the data synchronization process from Cloudflare R2
    when the Docker container starts. Runs in the background to avoid blocking
    the FastAPI server startup.
    """
    logger.info("Starting background auto-sync process...")
    
    # Optional: Brief delay to ensure database indexes and connections are fully stable
    await asyncio.sleep(3)
    
    try:
        if sync_status["is_syncing"]:
            logger.info("Sync already in progress, skipping auto-sync.")
            return

        # 1. Fetch files from R2 (This function is defined in main.py)
        # It handles connecting to R2 and downloading new files.
        files = await fetch_r2_files()
        
        if files:
            sync_status["current_step"] = "Saving to Database..."
            # 2. Process and save to MongoDB (backend is AnalyzerEngine from engine.py)
            new_count, skipped = await backend.load_multiple_from_memory(files)
            sync_status["last_message"] = f"Auto-sync: Added {new_count} records."
            logger.info(f"Auto-sync completed. Added {new_count} records.")
        else:
            if sync_status["last_message"] == "Invalid R2 Credentials":
                logger.error("Auto-sync failed: Invalid R2 Credentials.")
            else:
                logger.info("Auto-sync: No new data found on R2.")
                
    except Exception as e:
        logger.error(f"Auto-sync encountered an error: {e}")
        sync_status["last_message"] = f"Auto-sync Error: {str(e)}"
    finally:
        sync_status["is_syncing"] = False
        sync_status["current_step"] = "Idle"

@app.on_event("startup")
async def trigger_startup_sync():
    # Use create_task to run the sync in the background
    asyncio.create_task(auto_sync_on_startup())
