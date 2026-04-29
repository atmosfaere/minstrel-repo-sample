import asyncio
import random
from datetime import datetime, timedelta, timezone
from timeit import default_timer as timer

from .event import EventObject, EventType, schedule_event, event_queue

# Function to simulate event objects with random times
def create_random_event():
    future_time = datetime.now(timezone.utc) + timedelta(minutes=random.randint(1, 20))
    event_object = EventObject(
        time=future_time,
        event_type=EventType.simulated_character,
        id=str(random.randint(1, 100)),
        world=f"world_{random.randint(1, 5)}"
    )
    return event_object

# Benchmark function
async def benchmark_schedule_event(num_events):
    # Clear event queue for controlled testing environment
    event_queue.clear()

    # Generate random events to schedule
    random_events = [create_random_event() for _ in range(num_events)]

    # Start timer
    start_time = timer()

    # Schedule events
    for event in random_events:
        await schedule_event(event)

    # End timer
    end_time = timer()

    # Calculate elapsed time
    elapsed_time = end_time - start_time
    print(f"Total time to schedule {num_events} events: {elapsed_time:.4f} seconds")
    print(f"Average time per event: {elapsed_time / num_events:.4f} seconds")

# Example usage: Benchmarking the scheduling of 1000 events
async def main():
    await benchmark_schedule_event(10000)
    await benchmark_schedule_event(100)

if __name__ == "__main__":
    asyncio.run(main())

#print(event_queue)


