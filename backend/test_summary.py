import asyncio
from database_mongo import reports_collection
from datetime import datetime

async def test_summary():
    query = {}
    # Simulate get_global_summary logic
    cursor = reports_collection.find(query).sort("dt_obj", -1).limit(2000)
    results = await cursor.to_list(length=2000)
    
    print(f"RESULTS_LEN: {len(results)}")
    if not results:
        print("SUMMARY_DEBUG_NO_RESULTS")
        return

    latest_states = {}
    for r in results:
        site = r.get('site', 'Unknown')
        device = r.get('device', 'Unknown')
        key = f"{site}_{device}"
        if key not in latest_states:
            latest_states[key] = r

    print(f"UNIQUE_DEVICES: {len(latest_states)}")
    
    total_clients = 0
    up_devs = 0
    total_alerts = 0
    UP_STATES = ["up", "online", "connected", "good", "active", "normal", "stable", "1", "true"]
    
    for r in latest_states.values():
        state = str(r.get("state", "")).lower().strip()
        is_up = state in UP_STATES
        if is_up: up_devs += 1
        else: total_alerts += 1
        total_clients += (r.get("clients") or 0)
        
    print(f"SUMMARY_DEBUG_FINAL: clients={total_clients}, up={up_devs}, alerts={total_alerts}")

if __name__ == "__main__":
    asyncio.run(test_summary())
