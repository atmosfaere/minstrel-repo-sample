import time
import re
import datetime
import json
from datetime import datetime, timezone, timedelta
import logging
import secrets
from fastapi import FastAPI, HTTPException, Response, Request, status, APIRouter, Depends, Cookie, Body
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
#from starlette.concurrency import run_in_threadpool
from typing import Optional
#import boto3
#from botocore.exceptions import NoCredentialsError, PartialCredentialsError, ClientError, NoCredentialsError
#from passlib.context import CryptContext
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError

from starlette.status import HTTP_403_FORBIDDEN

from . import authentication
from . import third_party
from storage import s3_actions
from storage.data_store import users
#from fastapi_server import templates

#just for testing all on one server
router = APIRouter()

#import third_party_auth
'''
pwd_context = CryptContext(
    schemes=["argon2id"],
    default="argon2id",  # Use Argon2id variant
    argon2id__memory_cost=19 * 1024,  # 19 MiB of memory (memory_cost is in KiB)
    argon2id__time_cost=2,  # 2 iterations
    argon2id__parallelism=1,  # 1 degree of parallelism (single thread)
    deprecated="auto"
)'''

ph = PasswordHasher(
    time_cost=2,                # Number of iterations
    memory_cost=19 * 1024,      # Memory usage in KiB
    parallelism=1,              # Number of parallel threads
    type=Type.ID             # Specify Argon2id variant
)

BUCKET = "minstrel-accounts"

logging.basicConfig(level=logging.INFO)
'''
app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/templates", StaticFiles(directory="templates"), name="templates")
'''
def get_time_bytes():
    """Brief blocking of main event loop, noticeable impact or should make non blocking?"""
    # Get the current time and convert to microseconds
    current_microseconds = int(time.time() * 1000000)
    # Not practically necessary, but make sure time doesn't exceed 9 bytes
    # if code is still running in the far future
    masked_time = current_microseconds & ((1 << 72) - 1)
    return masked_time.to_bytes(9, 'big')

def create_user_id():
    """Brief blocking of main event loop, noticeable impact or make non blocking?"""
    time_portion = get_time_bytes()
    try:
        random_bits = secrets.token_bytes(7)
    except Exception as e:
        logging.error(f"Failed to generate random bytes - {e}", exc_info=True)
        raise RuntimeError("Random number generation failed.") from e
    user_id = time_portion + random_bits
    logging.info(f"New user ID generated: {user_id.hex()}")
    return user_id.hex()
'''
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Do some logging here
    print(exc.detail)
    return JSONResponse(content={"detail (specify as desired)": exc.detail}, status_code=exc.status_code)
'''
def verify_invite_cookie(request: Request) -> bool:
    invite_token = request.cookies.get("invite_token")
    payload = authentication.decode_jwt(invite_token, authentication.invite_key) if invite_token else None
    if not payload or payload.get("sub") != "invite":
        raise HTTPException(status_code=HTTP_403_FORBIDDEN, detail="Access denied. Valid invite required.")
    return True

@router.post("/email-availability")
async def email_availability(request:Request) -> bool:
    """ Endpoint to check availability of email. """
    data = await request.json()
    email = data['email']
    logging.info(f"Checking availability for email: {email}")

    exists = await s3_actions.check_key(BUCKET, "email/", email)

    logging.info(f"email: {email} is available - {not exists}")
    return JSONResponse(content={"available": not exists})

#wasn't being used by create account
#@app.post("/username-availability/")
@router.post("/username-availability")
async def username_availability(request:Request) -> bool:
    """ Endpoint to check availability of username. """
    data = await request.json()
    username = data['username']
    logging.info(f"Checking availability for username_or_email: {username}")
    exists = await s3_actions.check_key(BUCKET, "usernames/", username)

    logging.info(f"username: {username} is available - {not exists}")
    return JSONResponse(content={"available": not exists})  # Return True if available, False if not available

#if general_account_lock = true and no trusted_ device cookie then make them reset password at page access
#try request with missing username or password, make sure it doesn't crash and logs typeerror
#@app.post("/create-account/")
@router.post("/create-account")
async def create_account(request: Request, _: bool = Depends(verify_invite_cookie)):
    """ Endpoint that creates an account (on S3 bucket) by adding the user_id to email, username, and (third party) identifier
    prefixes to enable retrieving the user_id at login, then adds account details to accounts/user_id to
     allow processing login information"""

    data = await request.json()
    email = data.get("email", None)
    identifier = data.get("identifier", None)
    username = data['username']
    password = data['password']

    logging.info(f"Received request to create account for email: {email}, username: {username}")
    email_exists = False
    #input validation, prevent DoS attack from using long values
    #validate account info, don't let usernames have unallowed symbols, bypassed by attacker using endpoint directly, make sure emails are emails
    try:
        if email is not None:
            if len(email) > 320:
                raise ValueError("Email length exceeds the maximum allowed limit")
            if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
                raise ValueError("Invalid email format")
        if len(password) > 128:
            raise ValueError("Password length exceeds the maximum allowed limit")
        if len(username) < 3 or len(username) > 25:
            raise ValueError("Invalid username length")

        #ensure that email, username, and identifier keys are not already present,
        #as requests from bad client could overwrite existing accounts
        if await s3_actions.check_key(BUCKET, "email/", email):
            email_exists = True
            raise HTTPException(status_code=400, detail="Registration information is invalid or already in use.")
            #check before sending validation email for email sign up users
            #if email exists before validation say sending link to verify email, send email saying account already exists direct to sign in, have forgot password option in email
            # if email exists for third party sign up, need to notify (just continue and merge accounts?)
            #if identifier doesn't exist create it using id from email (effectively merge accounts), don't overwrite account_details
            #if 3rd party tries to sign in with email but account_details doesn't have password. address later. for now say login information is incorrect
            #what if they try to sign in with the other third party provider? a fresh account would be created, would go to asking if they want username
            #raise HTTPException(status_code=400, detail="Registration information is invalid or already in use.")
        if await s3_actions.check_key(BUCKET, "usernames/", username):
            raise HTTPException(status_code=400, detail="Registration information is invalid or already in use.")
        if identifier is not None:
            if len(identifier) > 512:
                raise ValueError("Identifier exceeds the maximum allowed limit")
            if await s3_actions.check_key(BUCKET, "identifier/", identifier):
                raise HTTPException(status_code=400, detail="Registration information is invalid or already in use.")

        hashed_password = ph.hash(password)
        user_id = create_user_id()

        #Store user_id for lookup during sign in. User's can sign in with email, username, or with third-party identifier in token
        if email is not None:
            """
            if not await s3_actions.check_key(BUCKET, "verified_email/", email):
                raise HTTPException(status_code=400, detail="Registration information is invalid")"""
            await s3_actions.store(BUCKET, "email/", email, user_id)
        await s3_actions.store(BUCKET, "usernames/", username, user_id)
        #store user_id under 3rd pary identifier for 3rd party login
        if identifier is not None:
            await s3_actions.store(BUCKET, "identifier/", identifier, user_id)

        #general account lock = false, trusted device lock = false, total failed attempts, total day, total month
        #failed_login_from_recognized, attacker could be attempting to sign in from user's device
        account_details = {"email": email, "username": username, "identifier": identifier,
                           "hashed_password": hashed_password, "created_at": datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M'),
                           "general_lock": False, "recognized_lock": False,
                           "failed_login_total": 0, "failed_login_from_recognized_month": 0}
        await s3_actions.store(BUCKET, "accounts/", f"{user_id}/account_details", account_details)
        await s3_actions.store(BUCKET, f"accounts/{user_id}/", "tokens", {})
        logging.info(f"Account creation successful for username: {username}")
        return {"message": "Account created successfully"}
    except ValueError as ve:
        logging.error(f"Input validation error during account creation: {ve}", exc_info=True)
        raise HTTPException(status_code=400, detail="Input validation error") from ve
    except HTTPException as e:
        # Re-raise HTTP exceptions that may have occurred in the s3 related function calls
        logging.warning(f"HTTP error during account creation: {e.detail}")
        raise HTTPException(status_code=e.status_code, detail="Error during account registration") from e
    except Exception as e:
        logging.error(f"Unexpected error during account creation: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred during account creation"
        ) from e
    #don't let attacker change email and overwrite(erase) another account
    #email = apple/google registration email
    #if email already exists let user know
    #don't lock out thirdparty user because email exists on sign-in from their 3rd party creation (this doesn't make sense, email field not created yet)
    #if try to create standalone account after making 3rd party let user know, they have a third party account
    #store 3rd party flag under that email instead
    # only if is_private_email true, no point in storing proxy.
    # do store proxy in account details, forwards to real email address.
    #3rdPartyId/sub give id

def clear_authentication_cookies(response: Response):
    try:
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")
        response.delete_cookie("remember_me")
        #clear state and nonce in third party function
    except Exception as e:
        logging.error(f"An error occurred while deleting cookies during logout {e}", exc_info=True)
        raise Exception("An error occurred while deleting cookies during logout") from e

#@app.post("/logout/")
@router.post("/logout/")
async def logout(response: Response):
    try:
        clear_authentication_cookies(response)
    except Exception as e:
        # Log the exception; the error is noted, but does not interfere with the flow
        logging.error(f"An error occurred while deleting cookies during logout: {e}")
    finally:
        # Always redirect to the sign-in page, even if an error occurs
        return RedirectResponse(url="https://minstrelai.com/sign-in", status_code=303)

'''how to prevent attacker from verifying and then changing user_id in cookies to a different user'''
'''associate request.sid with user_id returned by verify, user_id never touches client'''
'''if fail to verify when changing pages remove user_id from user_sessions {}, set user_sessions['request.sid'] = None'''
'''if user inactive remove them from sessions'''
'''if session cleared from inactivity, doesn't exist, send verification http request'''
'''clearing all users at same time might stress login server'''
'''malware could potentially hijack another users request.sid'''
'''if fail verify when clicking on part of site that makes request, set user_sessions['request.sid'] = None'''

#@app.post("/verify/")
#not meant to be publicly acessible, block in waf
@router.post("/verify")
async def verify(request: Request, response: Response):
    try:
        user_id = await authentication.verify_user(request, response)
        if user_id:
            #response should be returned in sign_in, used for both sign in and external server, can't send user_id to client
            return JSONResponse(status_code=status.HTTP_200_OK,
                                content={"user_id": user_id})
        else:
            await logout(response)
            #not currently using body content message
            return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED,
                                content={"message": "Verification failed"}
                                )
    except Exception as e:
        logging.error(f"Unexpected error during verification: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred"
        ) from e
# edit cookies

#@app.get("/invite/")
@router.get("/invite")
async def invite():
    return FileResponse("templates/invite.html")

#@app.post("/invite/")
#currently can be bypassed by navigating to sign-in or register
#could use session cookie local to server or header cookie, but not worrying about it for now
@router.post("/invite")
async def process_invite(request: Request, response: Response):
    data = await request.json()
    code = data['input']
    accepted_codes = ["aiworlds", "ai worlds"]
    if code.lower() in accepted_codes:
        expire_date = datetime.now(timezone.utc) + timedelta(days=730)
        token = authentication.create_invite_token(expire_date)
        response.set_cookie(key="invite_token", value=token, expires=expire_date, httponly=True,
                            secure=authentication.get_cookie_secure(request), samesite='strict')
        return {"success": True, "message": "Valid invite code"}
    raise HTTPException(status_code=400, detail="Invalid invite code")

@router.get("/api/invite-check")
async def invite_check(request: Request):
    invite_token = request.cookies.get("invite_token")
    payload = authentication.decode_jwt(invite_token, authentication.invite_key) if invite_token else None
    if payload and payload.get("sub") == "invite":
        return {"message": "Invite token is valid"}
    raise HTTPException(status_code=401, detail="Invalid or missing invite token")

@router.get("/api/auth-check")
async def auth_check(request: Request, response: Response):
    #access_token_cookie is removed by browser when expired
    refresh_token_cookie = request.cookies.get("refresh_token")
    if refresh_token_cookie:
        verified = await authentication.verify_user(request, response)
        if verified:
            return {"message": "Successfully authenticated"}
        else:
            raise HTTPException(status_code=401, detail="Authentication failed: Invalid token")
    else:
        raise HTTPException(status_code=401, detail="No authentication token provided")

"""
#@app.get("/sign-in/")
@router.get("/sign-in")
async def sign_in(request: Request, response: Response, _: bool = Depends(verify_invite_cookie)):
    #see if request has authentication cookies
    access_token_cookie = request.cookies.get("access_token")
    if access_token_cookie:
        verified = authentication.verify_user(request, response)
        if verified:
            return RedirectResponse(url="http://127.0.0.1:5005/", status_code=302)
            #return RedirectResponse(url="https://minstrelai.com", status_code=302)
        else:
            return FileResponse("templates/sign_on.html")
    else:
        return FileResponse("templates/sign_on.html")"""

#@app.post("/sign-in/")
@router.post("/sign-in")
async def submit_login(request:Request, response: Response, _: bool = Depends(verify_invite_cookie)):
    data = await request.json()
    email = data.get('email', None)
    username = data.get('username', None)
    password = data['password']
    remember_me = data.get('remember_me', None)

    if email is not None:
        prefix = "email/"
        email_or_username = email
    elif username is not None:
        prefix = "usernames/"
        email_or_username = username
    else:
        raise ValueError("Both email and username cannot be None")

    user_id = await s3_actions.retrieve(BUCKET, prefix, email_or_username)
    # account lock = reset password(email verification) or verify email
    account_details = await s3_actions.retrieve(BUCKET, f"accounts/{user_id}/", "account_details")
    #account_details = json.loads(account_data)
    hashed_password = account_details['hashed_password']

    try:
        ph.verify(hashed_password, password)

    except VerifyMismatchError:
        logging.info(f"Failed password verification for user, {user_id}")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    #Remember_me token needs to be created before calling get_auth_tokens in order to set refresh exp length
    if remember_me == True:
        authentication.create_remember_me_jwt(user_id, request, response)
    else:
        request.state.remember_me_unselected = True
        #make sure cookie isn't refreshed and recreated in get_auth_tokens after deleting
        response.delete_cookie("remember_me")

    await authentication.get_auth_tokens(request, response, user_id)

    if user_id not in users:
        users[user_id] = {}
        users[user_id]['username'] = account_details['username']

    return {"message": "Successfully authenticated"}


# look at account lock
# increment failed attempts if necessary
# make change password if necessary, send email
# verifying email doesn't reset password, attackers can continue making attempts on the same password but can't get in without email
# if remember me is selected add remember me


@router.get("/register/")
async def register(request: Request, _: bool = Depends(verify_invite_cookie)):
    return FileResponse("templates/register.html")
    #return templates.TemplateResponse("register.html", {"request": request})


def _set_pending_cookie(response: Response, request: Request, name: str, value: str, max_age: int):
    response.set_cookie(
        key=name, value=value, httponly=True,
        secure=authentication.get_cookie_secure(request),
        samesite="strict", max_age=max_age,
        domain=authentication.get_cookie_domain(request),
    )

def _delete_pending_cookie(response: Response, request: Request, name: str):
    """Delete a pending-state cookie using the same attributes it was set with.
    Browsers match cookies for deletion by name+domain+path+samesite."""
    response.delete_cookie(
        key=name,
        httponly=True,
        secure=authentication.get_cookie_secure(request),
        samesite="strict",
        domain=authentication.get_cookie_domain(request),
    )


@router.post("/auth/google/token")
async def google_token(request: Request, response: Response, _: bool = Depends(verify_invite_cookie)):
    """Verify a Google ID token from the Google Identity Services JS SDK."""
    data = await request.json()
    id_token = data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="id_token required")
    try:
        user_info = await third_party.get_google_user_info(id_token)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Google token verification error: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="Google authentication failed")

    result, payload = await third_party.handle_oauth_token(
        "google", user_info["sub"], user_info["email"], user_info["name"], request, response
    )
    if result == "ok":
        return {"status": "ok"}
    if result == "new_user":
        _set_pending_cookie(response, request, "oauth_new_user", payload, 1800)
    else:
        _set_pending_cookie(response, request, "oauth_merge_pending", payload, 900)
    return {"status": result}


@router.post("/auth/apple/token")
async def apple_token(request: Request, response: Response, _: bool = Depends(verify_invite_cookie)):
    """Verify an Apple ID token from the Apple JS SDK.
    Pass user_json (JSON string) only on first authorisation — Apple sends it once."""
    data = await request.json()
    id_token = data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="id_token required")
    try:
        user_info = await third_party.get_apple_user_info(id_token, data.get("user"))
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Apple token verification error: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="Apple authentication failed")

    result, payload = await third_party.handle_oauth_token(
        "apple", user_info["sub"], user_info["email"], user_info["name"], request, response
    )
    if result == "ok":
        return {"status": "ok"}
    if result == "new_user":
        _set_pending_cookie(response, request, "oauth_new_user", payload, 1800)
    else:
        _set_pending_cookie(response, request, "oauth_merge_pending", payload, 900)
    return {"status": result}


@router.post("/auth/complete-oauth-registration")
async def complete_oauth_registration(request: Request, response: Response, _: bool = Depends(verify_invite_cookie)):
    """Second step for new OAuth users: submit chosen username and create account."""
    new_user_token = request.cookies.get("oauth_new_user")
    if not new_user_token:
        raise HTTPException(status_code=400, detail="No pending OAuth registration")

    token_data = third_party.decode_new_user_token(new_user_token)
    if not token_data:
        raise HTTPException(status_code=400, detail="Invalid or expired registration token")

    data = await request.json()
    username = data.get("username", "")

    if len(username) < 3 or len(username) > 25:
        raise HTTPException(status_code=400, detail="Username must be between 3 and 25 characters")
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        raise HTTPException(status_code=400, detail="Username may only contain letters, numbers, and underscores")
    if await s3_actions.check_key(BUCKET, "usernames/", username):
        raise HTTPException(status_code=400, detail="Username is already taken")

    try:
        user_id = await third_party._create_oauth_account(
            token_data["provider"],
            token_data["scoped_sub"],
            token_data["email"],
            username,
        )
        await third_party._finish_oauth_login(user_id, request, response)
        _delete_pending_cookie(response, request, "oauth_new_user")
        return {"status": "ok"}
    except Exception as e:
        logging.error(f"Error completing OAuth registration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Account creation failed")


@router.post("/auth/link-provider")
async def link_provider(request: Request, response: Response):
    """Link a pending OAuth provider to an existing password account.
    If the existing account has no password (OAuth-only), the link is automatic
    since both providers verified the same email."""
    merge_token = request.cookies.get("oauth_merge_pending")
    if not merge_token:
        raise HTTPException(status_code=400, detail="No pending provider link")

    merge_data = third_party.decode_merge_token(merge_token)
    if not merge_data:
        raise HTTPException(status_code=400, detail="Invalid or expired link token")

    data = await request.json()
    email = data.get("email")
    username = data.get("username")
    password = data.get("password")

    if not email and not username:
        raise HTTPException(status_code=400, detail="Email or username required")

    try:
        if email:
            user_id = await s3_actions.retrieve(BUCKET, "email/", email)
        else:
            user_id = await s3_actions.retrieve(BUCKET, "usernames/", username)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    account_details = await s3_actions.retrieve(BUCKET, f"accounts/{user_id}/", "account_details")

    # Ensure the account the user is trying to link to actually owns the conflicting email.
    # This prevents a user from redirecting an OAuth link to an unrelated account.
    if account_details.get("email") != merge_data.get("email"):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    hashed_password = account_details.get("hashed_password")

    if hashed_password:
        if not password:
            raise HTTPException(status_code=400, detail="Password required to link this account")
        try:
            ph.verify(hashed_password, password)
        except VerifyMismatchError:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    # No password → OAuth-only account: both providers verified the same email → auto-link

    try:
        await third_party.link_provider_to_account(
            user_id, merge_data["provider"], merge_data["scoped_sub"]
        )
        await third_party._finish_oauth_login(user_id, request, response)
        _delete_pending_cookie(response, request, "oauth_merge_pending")
        return {"status": "ok"}
    except Exception as e:
        logging.error(f"Error linking provider: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Account linking failed")

# ensure that sender is Minstrel or the user with user_id, else attacker can sign anyone out
#@router.post("/lost-device/")
async def lost_device(user_id):
    # if sub = minstrel or user_id
    # make sure not abused by attacker to log legitimate user out of their logged in devices?
    await authentication.blacklist_issued_tokens(user_id)


#functions for user deleting their data from the platform, regulations,
# go through each room in their profile, make name anonymous.

#if report account compromised, but still have access to email, general account lock, trusted lock, have to reset password, blacklist all tokens