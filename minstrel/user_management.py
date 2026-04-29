from datetime import datetime, timezone, timedelta
from data_store import users

def init_user(user_id):
    users[user_id] = {}

def update_user_activity(user_id):
    if user_id not in users:
        init_user(user_id)
    users[user_id]["last_active"] = datetime.now(timezone.utc)