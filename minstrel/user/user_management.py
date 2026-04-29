from datetime import datetime, timezone, timedelta
from storage.data_store import users

def init_user(user_id):
    users[user_id] = {}

# user activity on world is updated and tracked in world/users
'''
def update_user_activity(user_id):
    if user_id not in users:
        init_user(user_id)
    users[user_id]["last_active"] = datetime.now(timezone.utc)
'''