from datetime import datetime, timezone, timedelta
from sortedcontainers import SortedList
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional
import asyncio
from asyncio import Lock
import logging

from .world_utils import unload_world, worlds_failed_to_unload
from storage.data_store import worlds, users
from .event import EventObject, EventType, event_lock, event_queue
from .simulation import simulate_character

logger = logging.getLogger(__name__)


processing = False

wait_to_queue = []

async def process_events():
    while True:
        try:
            async with event_lock:
                now = datetime.now(timezone.utc)
                cutoff_index = event_queue.bisect_right(EventObject(
                    time=now,
                    event_type=EventType.simulated_character,
                    id=None,
                    world=None
                ))

                due_events = []
                if cutoff_index > 0:
                    due_events = event_queue[:cutoff_index]
                    del event_queue[:cutoff_index]

                for event in due_events:
                    asyncio.create_task(do_event(event))

        except Exception as e:
            logging.exception(f"Error in process_events(): {e}")
        finally:
            await asyncio.sleep(.1)

#char_examp = {"time": "scheduled_datetime", "type": "simulated_character", "character_id": "id"}
async def do_event(event_object: EventObject):
    if event_object.event_type == EventType.simulated_character:
        character_id = event_object.id
        world = event_object.world
        await simulate_character(world, character_id)


async def check_world_activity():
    """Unload inactive worlds.
        Frees up ram for loading worlds of arriving users"""
    while True:
        try:
            now = datetime.now(timezone.utc)
            fifteen_minutes_ago = now - timedelta(minutes=15)
            for world in worlds_failed_to_unload:
                asyncio.create_task(unload_world(world))
            for world_id, world in list(worlds.items()):
                last_active = world['activity'].get('last_active', now)
                if isinstance(last_active, str):
                    last_active = datetime.fromisoformat(last_active)
                if last_active < fifteen_minutes_ago:
                    logging.info(f"Unloading inactive world: {world_id}")
                    asyncio.create_task(unload_world(world_id))
        except Exception as e:
            logging.exception("Error in check_user_activity: %s", e)
        finally:
            await asyncio.sleep(60)