from auth.authentication import verify_user
from fastapi import Request, Response, HTTPException
from storage import s3_actions
from storage.data_store import users


async def authenticate(request: Request, response: Response):
    try:
        user_id = await verify_user(request, response)
        # verify_user calls response.set_cookie() internally for any rotated tokens
        if not user_id:
            raise HTTPException(status_code=401, detail="Authentication required.")

        if user_id not in users:
            users[user_id] = {}
        users[user_id]['username'] = await s3_actions.get_username(user_id)
        return user_id

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication required.")
