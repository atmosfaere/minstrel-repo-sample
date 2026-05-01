from networking.http_client import http_client
from fastapi import Request, Response, HTTPException
from fastapi.responses import RedirectResponse
from aiohttp import ClientResponseError
from storage import s3_actions
from storage.data_store import users
import os


async def authenticate(request: Request, response: Response):
    _AUTH_COOKIES = {"access_token", "refresh_token", "remember_me"}
    cookie_header = "; ".join(
        f"{k}={v}" for k, v in request.cookies.items() if k in _AUTH_COOKIES
    )
    headers = {
        "Cookie": cookie_header,
        "X-Forwarded-Host": request.headers.get("host", ""),
    }
    try:
        # Get the base URL from the request or environment variable
        if 'AUTH_SERVER_URL' in os.environ:
            verify_url = os.getenv('AUTH_SERVER_URL') + '/verify'
        else:
            # Build URL from the current request
            scheme = request.url.scheme
            host = request.headers.get('host', request.url.hostname)
            verify_url = f"{scheme}://{host}/verify"
        
        auth_data, auth_headers = await http_client.post_with_headers(verify_url, headers=headers)

        for cookie in auth_headers.getall('Set-Cookie', []):
            response.headers.append('Set-Cookie', cookie)

        user_id = auth_data.get("user_id")
        if user_id not in users:
            users[user_id] = {}

        # Fetch the username from S3 and store it
        users[user_id]['username'] = await s3_actions.get_username(user_id)
        return user_id

    except ClientResponseError:
        # If authentication fails, redirect to the sign-in page
        #return RedirectResponse(url="https://minstrelai.com/sign-in", status_code=303)
        raise HTTPException(status_code=401, detail="Authentication required.")
