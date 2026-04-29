from networking.http_client import http_client
from fastapi import Request, Response, HTTPException
from fastapi.responses import RedirectResponse
from aiohttp import ClientResponseError
from storage import s3_actions
from storage.data_store import users
import os


async def authenticate(request: Request, response: Response):
    # Extract cookies for sending to verification server.
    cookie_header = "; ".join([f"{key}={value}" for key, value in request.cookies.items()])
    headers = {"Cookie": cookie_header}
    try:
        # Get the base URL from the request or environment variable
        if 'AUTH_SERVER_URL' in os.environ:
            verify_url = os.getenv('AUTH_SERVER_URL') + '/verify'
        else:
            # Build URL from the current request
            scheme = request.url.scheme
            host = request.headers.get('host', request.url.hostname)
            verify_url = f"{scheme}://{host}/verify"
        
        # Call the post() method, which already returns JSON
        auth_data = await http_client.post(verify_url, headers=headers)

        if 'Set-Cookie' in auth_data:  # This should be checking headers, not auth_data
            cookies = auth_data.get('Set-Cookie', [])
            for cookie in cookies:
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
