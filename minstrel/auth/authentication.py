import os
import jwt
from jwt import PyJWK
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError, InvalidAudienceError
from fastapi import HTTPException, Depends, status, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from datetime import datetime, timedelta, timezone
#import boto3
import secrets
import json
import logging
from storage import s3_actions

logger = logging.getLogger(__name__)

BUCKET = "minstrel-accounts"

#using separate keys prevents an attacker or negligent developer from sending one type of token in place of another type of token, token won't be validated
#probably need to implement ability to rotate keys check past keys as well as present
secret_key = os.getenv("ACCESS_TOKEN_SECRET_KEY")
refresh_secret_key = os.getenv("REFRESH_SECRET_KEY")
remember_me_key = os.getenv("REMEMBER_ME_KEY")
forgot_password_key = os.getenv("FORGOT_PASSWORD_KEY")
invite_key = "a3f1d2e4b5c6789012345678901234567890abcdef1234567890abcdef123456"

ALGORITHM = "HS256"

def get_cookie_domain(request) -> str | None:
    """Derive the cookie domain from the request host.
    """
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host", "")
    ).split(":")[0]
    if host in ("127.0.0.1", "localhost", ""):
        return None
    return host

def get_cookie_secure(request) -> bool:
    return request.url.scheme == "https"

#token expiration periods
access_exp_length = 15 #minutes
app_exp_length = 400 #days, 400 is max for chrome and edge cookies
#used for both remember_me cookie expiration and web refresh token expiration.
remember_me_exp_length = 180 #days
web_exp_length = 1 #day
def is_mobile_user_agent(request: Request) -> bool:
    user_agent = request.headers.get('User-Agent', '').lower()
    mobile_indicators = [
        'mobile', 'android', 'iphone', 'ipad', 'tablet',
        'kindle', 'ipod', 'windows phone', 'blackberry', 'webos',
        'opera mini', 'opera mobi', 'iemobile', 'nokia'
    ]
    return any(indicator in user_agent for indicator in mobile_indicators)


def create_remember_me_jwt(user_id, request: Request, response: Response):
    expiration_time = datetime.now(timezone.utc) + timedelta(days=remember_me_exp_length)
    payload = {'sub': user_id, 'exp': expiration_time.timestamp()}
    token = jwt.encode(payload, remember_me_key, algorithm='HS256')
    response.set_cookie(key="remember_me", value=token, httponly=True, secure=True,
                        samesite='strict', expires=expiration_time, domain=get_cookie_domain(request))
    logging.info(f"created remember me token for user: {user_id}")
    request.state.remember_me_created = True


def create_invite_token(expire_date) -> str:
    payload = {'sub': 'invite', 'exp': expire_date.timestamp()}
    return jwt.encode(payload, invite_key, algorithm=ALGORITHM)


def create_password_reset_token(user_id):
    expiration_time = datetime.now(timezone.utc) + timedelta(hours=1)
    payload = {'sub': user_id, 'exp': expiration_time}
    token = jwt.encode(payload, forgot_password_key, algorithm=ALGORITHM)
    logging.info(f"created password reset token for user: {user_id}")
    return token


def decode_jwt(token: str, key: str | PyJWK, algorithm=ALGORITHM, audience=None, issuer=None):
    """
    Decodes a JWT and returns its content if valid.
    """
    options = {
        'verify_exp': True,
        'verify_aud': False,
        'verify_iss': False
    }
    if audience:
        options['verify_aud'] = True
    if issuer:
        options['verify_iss'] = True

    if isinstance(key, PyJWK):
        key = key.key

    try:
        payload = jwt.decode(token, key, algorithms=[algorithm],
                             audience=audience, issuer=issuer, options=options
        )
        return payload
        
    except ExpiredSignatureError as e:
        try:
            sub = jwt.decode(token, options={"verify_signature": False, "verify_exp": False}).get("sub", "unknown")
        except Exception:
            sub = "unknown"
        logging.info(f"Token expired for sub='{sub}': {e}")
        return None
    except InvalidAudienceError as e:
        try:
            sub = jwt.decode(token, options={"verify_signature": False, "verify_exp": False, "verify_aud": False}).get("sub", "unknown")
        except Exception:
            sub = "unknown"
        logging.warning(f"Invalid audience for sub='{sub}' (expected {audience}): {e}")
        return None
    except InvalidTokenError as e:
        logging.warning(f"Invalid token error: {e}")
        return None

async def add_issued_token(jti: str, exp: int, user_id: str):
    logging.info(f"adding refresh token to list of user's issued tokens in s3 for user: {user_id}")
    try:
        user_tokens = await s3_actions.retrieve(BUCKET, f"accounts/{user_id}/", "tokens")
        if "issued" not in user_tokens:
            user_tokens["issued"] = []
        user_tokens["issued"].append({"jti": jti, "exp": exp})
        await s3_actions.store(BUCKET, f"accounts/{user_id}/", "tokens", user_tokens)
    except Exception as e:
        logging.error(f"Adding user {user_id}'s token to list of issued tokens in s3: Exception - {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e

#add remember me on this device (computer) but identify device just use remember-me cookie (using ip and user-agent, if either changes, assume new device)
#if logout delete token cookies
async def get_auth_tokens(request: Request, response: Response, user_id: str):
    """Create new auth and refresh token and set them as cookies.
    Called once user has registered or logged in without cookies, or refresh token was used for verification."""
    current_time = datetime.now(timezone.utc)
    access_token_expires = current_time + timedelta(minutes=access_exp_length)

    #set refresh token expiration length using mobile status or presence of signed remember_me cookie
    # instead of is_mobile check for app id or name in user-agent from webview is_app
    is_mobile = is_mobile_user_agent(request)
    unselected = getattr(request.state, 'remember_me_unselected', False)

    remember_me_cookie = request.cookies.get("remember_me")
    valid_remember_me_cookie = False

    remember_me_token_created = getattr(request.state, 'remember_me_created', False)


    #attacker would need account and password to get remember_me token even if they stole auth cookies?
    remember_me_status = decode_jwt(remember_me_cookie, remember_me_key) if remember_me_cookie else None
    if remember_me_status:
        if remember_me_status['sub'] == user_id:
            valid_remember_me_cookie = True
            # refresh remember_me if cookie is valid?
            if not unselected and not remember_me_token_created:
                create_remember_me_jwt(user_id, request, response)

    if is_mobile and ((valid_remember_me_cookie or remember_me_token_created) and not unselected):
        refresh_token_expires = current_time + timedelta(days=app_exp_length)
        print("refresh exp: app")
    elif (valid_remember_me_cookie or remember_me_token_created) and not unselected:
        refresh_token_expires = current_time + timedelta(days=remember_me_exp_length)
        print("refresh exp: web remember me")
    else:
        refresh_token_expires = current_time + timedelta(days=web_exp_length)
        print("refresh exp: regular 1 day")

    # jwt uses unix timestamp, cookies use datetime
    access_token_expires_unix = int(access_token_expires.timestamp())
    refresh_token_expires_unix = int(refresh_token_expires.timestamp())

    jti = secrets.token_bytes(16).hex()
    access_token_data = {"sub": user_id, "exp": access_token_expires_unix}
    refresh_token_data = {"sub": user_id, "exp": refresh_token_expires_unix, "jti": jti}

    access_token = jwt.encode(access_token_data, secret_key, algorithm=ALGORITHM)
    refresh_token = jwt.encode(refresh_token_data, refresh_secret_key, algorithm=ALGORITHM)
    try:
        await add_issued_token(jti, refresh_token_expires_unix, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=get_cookie_secure(request),
                        samesite='strict', expires=access_token_expires, domain=get_cookie_domain(request))
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=get_cookie_secure(request),
                        samesite='strict', expires=refresh_token_expires, domain=get_cookie_domain(request))
    #add JTI to s3 issued_tokens, blacklisted_tokens have user change password instead of checking blacklisted tokens = general and trusted_device account lock
    return jti
    #need to return response somewhere return {"message": "Login Processed"}

async def verify_user(request, response):
    access_token_cookie = request.cookies.get("access_token")
    refresh_token_cookie = request.cookies.get("refresh_token")
    access_token_status = decode_jwt(access_token_cookie, secret_key) if access_token_cookie else None
    refresh_token_status = decode_jwt(refresh_token_cookie, refresh_secret_key) if refresh_token_cookie else None

    if access_token_status:
        user_id = access_token_status['sub']
        logging.info(f"Verified user: {user_id}, by access token")
        return user_id

    elif refresh_token_status:
        user_id = refresh_token_status['sub']
        jti = refresh_token_status['jti']
        async with s3_actions.get_user_lock(BUCKET, f"accounts/{user_id}/"):
            try:
                user_tokens = await s3_actions.retrieve(BUCKET, f"accounts/{user_id}/", "tokens")
            except Exception as e:
                logging.error(f"Error retrieving user_tokens for: {user_id} during verification - {e}", exc_info=True)
                raise Exception("Error retrieving user_tokens for verification") from e
            if any(entry["jti"] == jti for entry in user_tokens.get("blacklist", [])):
                logging.info(f"Unable to verify user: {user_id}, using blacklisted token with jti: {jti}")
                return False
            # Blacklist the consumed token, must stay inside the lock to prevent race condition
            await blacklist_issued_token(jti, user_id)
        #use refresh token to get new access token, and update refresh_token(single use)
        await get_auth_tokens(request, response, user_id)
        return user_id
    else:
        logging.info(f"Verification failed, invalid or expired token")
        return False
    #can potentially identify attack if token is reused (use logging).


def _prune_blacklist(user_tokens: dict) -> list:
    """Return the blacklist with expired entries removed, logging the count pruned."""
    now = datetime.now(timezone.utc).timestamp()
    existing = user_tokens.get("blacklist", [])
    pruned = [entry for entry in existing if entry["exp"] > now]
    pruned_count = len(existing) - len(pruned)
    if pruned_count:
        logging.info(f"Pruned {pruned_count} expired entries from blacklist")
    return pruned


async def blacklist_issued_token(jti: str, user_id: str):
    """Consume a single refresh token JTI during normal rotation."""
    user_tokens = await s3_actions.retrieve(BUCKET, f"accounts/{user_id}/", "tokens")

    issued = user_tokens.get("issued", [])
    consumed = next((entry for entry in issued if entry["jti"] == jti), None)
    if consumed is None:
        logging.warning(f"JTI not found in issued list for user: {user_id}, jti: {jti}")

    user_tokens["issued"] = [entry for entry in issued if entry["jti"] != jti]
    blacklist = _prune_blacklist(user_tokens)
    if consumed:
        blacklist.append(consumed)
    user_tokens["blacklist"] = blacklist

    await s3_actions.store(BUCKET, f"accounts/{user_id}/", "tokens", user_tokens)


async def blacklist_issued_tokens(user_id: str):
    """Invalidate all active refresh tokens. Used for lost device / account compromise."""
    user_tokens = await s3_actions.retrieve(BUCKET, f"accounts/{user_id}/", "tokens")

    now = datetime.now(timezone.utc).timestamp()
    issued = user_tokens.get("issued", [])

    active_entries = [entry for entry in issued if entry["exp"] > now]
    expired_jtis = [entry["jti"] for entry in issued if entry["exp"] <= now]

    for entry in active_entries:
        logging.info(f"Blacklisting active token for user: {user_id}, jti: {entry['jti']}")
    for jti in expired_jtis:
        logging.info(f"Discarding expired issued token for user: {user_id}, jti: {jti}")

    user_tokens["issued"] = []
    user_tokens["blacklist"] = _prune_blacklist(user_tokens) + active_entries

    await s3_actions.store(BUCKET, f"accounts/{user_id}/", "tokens", user_tokens)

#test
'''
user_id = "aaef98912348"
expiration_time = datetime.now(timezone.utc) + timedelta(days=remember_me_exp_length)  # Token expires in 30 days
payload = {'sub': user_id, 'exp': expiration_time}
token = jwt.encode(payload, secret_key, algorithm='HS256')
print(decode_jwt(token, secret_key))
print(token)

print(decode_jwt("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDYyZGU1YWJjNGQ3MGVhOTNjZWU0ZjU1MWJmMSIsImV4cCI6MTczOTMyMjM4NH0.Ttd-KXVONVkVgzXAxd112BkMtBwA15_CPUf9kBZGj-A", secret_key))
'''