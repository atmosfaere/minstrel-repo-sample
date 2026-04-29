from datetime import datetime, timezone, timedelta
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional
from asyncio import Lock
from sortedcontainers import SortedList

event_lock = Lock()

#much faster scheduling of events than using regular list
event_queue = SortedList(key=lambda x: x.time)

class EventType(str, Enum):
    simulated_character = "simulated_character"

class EventObject(BaseModel):
    event_type: EventType = Field(..., description="Type of the event being scheduled")
    id: Optional[str] = Field(..., description="ID of the event object such as character or location id")
    world: Optional[str] = Field(..., description="World where the event will be processed")
    time: datetime = Field(..., description="UTC time the event should occur")

async def schedule_event(event_object: EventObject):
    async with event_lock:
        event_queue.add(event_object)