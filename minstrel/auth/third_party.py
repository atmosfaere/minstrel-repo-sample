import os
import re
import time
import json
import secrets
import logging

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError
from datetime import datetime, timezone, timedelta
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException, Request, Response

from storage import s3_actions
from . import authentication

logger = logging.getLogger(__name__)

BUCKET = "minstrel-accounts"

# ── Provider config ───────────────────────────────────────────────────────────
# Switch all of these to env vars before deploying a separate auth server
# (same pattern as authentication.py)

GOOGLE_CLIENT_ID = "your-google-client-id.apps.googleusercontent.com"
#GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

APPLE_CLIENT_ID  = "com.your.app"          # Apple Services ID
APPLE_TEAM_ID    = "XXXXXXXXXX"
APPLE_KEY_ID     = "XXXXXXXXXX"
APPLE_PRIVATE_KEY = ""                      # ES256 PEM string (newlines preserved)
#APPLE_CLIENT_ID   = os.getenv("APPLE_CLIENT_ID")
#APPLE_TEAM_ID     = os.getenv("APPLE_TEAM_ID")
#APPLE_KEY_ID      = os.getenv("APPLE_KEY_ID")
#APPLE_PRIVATE_KEY = os.getenv("APPLE_PRIVATE_KEY")

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUER   = "https://accounts.google.com"
APPLE_JWKS_URL  = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER    = "https://appleid.apple.com"

# Module-level JWKS clients — cache persists across requests (lifespan seconds)
_google_jwks_client = PyJWKClient(GOOGLE_JWKS_URL, cache_jwk_set=True, lifespan=300)
_apple_jwks_client  = PyJWKClient(APPLE_JWKS_URL,  cache_jwk_set=True, lifespan=300)

# Signing keys for pending-state cookies.
# Switch to env vars before production.
oauth_new_user_key = "b3c4d5e6f7a8901234567890123456789012345678901234567890123456789012"
merge_key          = "c4d5e6f7a8b9012345678901234567890123456789012345678901234567890123"
#oauth_new_user_key = os.getenv("OAUTH_NEW_USER_KEY")
#merge_key          = os.getenv("MERGE_TOKEN_KEY")

ALGORITHM = "HS256"

# ── JWKS / ID token verification ─────────────────────────────────────────────

async def _verify_provider_id_token(
    id_token: str, jwks_client: PyJWKClient, audience: str, issuer: str
) -> dict:
    """Verify an RS256 ID token using a shared module-level JWKS client.
    Runs synchronous key-lookup in a threadpool to avoid blocking the event loop."""
    def _sync():
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)
        return jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=issuer,
        )
    try:
        return await run_in_threadpool(_sync)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Provider token expired")
    except jwt.InvalidTokenError as exc:
        logger.warning(f"Invalid provider token: {exc}")
        raise HTTPException(status_code=401, detail="Invalid provider token")
    except PyJWKClientError as exc:
        logger.error(f"JWKS fetch/parse error: {exc}", exc_info=True)
        raise HTTPException(status_code=503, detail="Could not reach identity provider. Try again shortly.")

# ── Google ────────────────────────────────────────────────────────────────────

async def get_google_user_info(id_token: str) -> dict:
    """Verify a Google ID token and return normalised user info."""
    payload = await _verify_provider_id_token(
        id_token, _google_jwks_client, GOOGLE_CLIENT_ID, GOOGLE_ISSUER
    )
    if not payload.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email is not verified")
    return {
        "sub": payload["sub"],
        "email": payload.get("email", ""),
        "name": payload.get("name", ""),
    }

# ── Apple ─────────────────────────────────────────────────────────────────────

async def get_apple_user_info(id_token: str, user_json: str | None = None) -> dict:
    """Verify an Apple ID token and return normalised user info.
    user_json is a JSON string Apple sends only on the very first authorisation."""
    payload = await _verify_provider_id_token(
        id_token, _apple_jwks_client, APPLE_CLIENT_ID, APPLE_ISSUER
    )
    name = ""
    if user_json:
        try:
            user_data = json.loads(user_json) if isinstance(user_json, str) else user_json
            n = user_data.get("name", {})
            name = f"{n.get('firstName', '')} {n.get('lastName', '')}".strip()
        except Exception:
            pass
    return {
        "sub": payload["sub"],
        "email": payload.get("email", ""),
        "name": name,
    }


def make_apple_client_secret() -> str:
    """Generate an Apple client_secret (ES256 JWT).
    Required if you ever exchange an authorisation code for a refresh token."""
    now = int(time.time())
    payload = {
        "iss": APPLE_TEAM_ID,
        "iat": now,
        "exp": now + 15_777_000,  # ~6 months (Apple maximum)
        "aud": "https://appleid.apple.com",
        "sub": APPLE_CLIENT_ID,
    }
    return jwt.encode(
        payload, APPLE_PRIVATE_KEY, algorithm="ES256", headers={"kid": APPLE_KEY_ID}
    )

# ── Pending-state JWT helpers ─────────────────────────────────────────────────

def create_new_user_token(provider: str, scoped_sub: str, email: str, display_name: str) -> str:
    """30-minute token stored in the oauth_new_user cookie while user picks a username."""
    exp = datetime.now(timezone.utc) + timedelta(minutes=30)
    payload = {
        "sub": "oauth_new_user",
        "provider": provider,
        "scoped_sub": scoped_sub,
        "email": email,
        "display_name": display_name,
        "exp": exp.timestamp(),
    }
    return jwt.encode(payload, oauth_new_user_key, algorithm=ALGORITHM)

def decode_new_user_token(token: str) -> dict | None:
    payload = authentication.decode_jwt(token, oauth_new_user_key)
    if payload and payload.get("sub") == "oauth_new_user":
        return payload
    return None


def create_merge_token(provider: str, scoped_sub: str, email: str, display_name: str) -> str:
    """15-minute token stored in the oauth_merge_pending cookie during account linking."""
    exp = datetime.now(timezone.utc) + timedelta(minutes=15)
    payload = {
        "sub": "oauth_merge",
        "provider": provider,
        "scoped_sub": scoped_sub,
        "email": email,
        "display_name": display_name,
        "exp": exp.timestamp(),
    }
    return jwt.encode(payload, merge_key, algorithm=ALGORITHM)

def decode_merge_token(token: str) -> dict | None:
    payload = authentication.decode_jwt(token, merge_key)
    if payload and payload.get("sub") == "oauth_merge":
        return payload
    return None

# ── Username generation ───────────────────────────────────────────────────────

async def generate_unique_username(display_name: str) -> str:
    """Derive a valid, unique username from a display name."""
    base = re.sub(r"[^a-zA-Z0-9_]", "", display_name.replace(" ", "_"))[:20] or "user"
    if not await s3_actions.check_key(BUCKET, "usernames/", base):
        return base
    for _ in range(12):
        candidate = f"{base[:16]}_{secrets.token_hex(3)}"
        if not await s3_actions.check_key(BUCKET, "usernames/", candidate):
            return candidate
    return f"user_{secrets.token_hex(6)}"

# ── Core OAuth handler ────────────────────────────────────────────────────────

async def handle_oauth_token(
    provider: str,
    sub: str,
    email: str,
    display_name: str,
    request: Request,
    response: Response,
) -> tuple[str, str | None]:
    """
    Called after the provider ID token is verified.

    Returns one of:
      ("ok",        user_id)     — auth cookies already set on response
      ("new_user",  new_user_jwt) — no account yet; caller sets oauth_new_user cookie
      ("conflict",  merge_jwt)   — email taken; caller sets oauth_merge_pending cookie
    """
    scoped_sub = f"{provider}:{sub}"

    # Returning user — provider already linked
    if await s3_actions.check_key(BUCKET, "identifier/", scoped_sub):
        user_id = await s3_actions.retrieve(BUCKET, "identifier/", scoped_sub)
        await _finish_oauth_login(user_id, request, response)
        return "ok", user_id

    # Email already registered under a different (or no) provider
    if email and await s3_actions.check_key(BUCKET, "email/", email):
        token = create_merge_token(provider, scoped_sub, email, display_name)
        return "conflict", token

    # Brand-new user — hold state until they pick a username
    token = create_new_user_token(provider, scoped_sub, email, display_name)
    return "new_user", token


async def _create_oauth_account(
    provider: str, scoped_sub: str, email: str, username: str
) -> str:
    user_id = authentication.create_user_id()

    if email:
        await s3_actions.store(BUCKET, "email/", email, user_id)
    await s3_actions.store(BUCKET, "usernames/", username, user_id)
    await s3_actions.store(BUCKET, "identifier/", scoped_sub, user_id)

    account_details = {
        "email": email,
        "username": username,
        "identifier": scoped_sub,
        "linked_providers": [provider],
        "hashed_password": None,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "general_lock": False,
        "recognized_lock": False,
        "failed_login_total": 0,
        "failed_login_from_recognized_month": 0,
    }
    await s3_actions.store(BUCKET, "accounts/", f"{user_id}/account_details", account_details)
    await s3_actions.store(BUCKET, f"accounts/{user_id}/", "tokens", {})
    logger.info(f"Created OAuth account via {provider}, user_id: {user_id}")
    return user_id


async def _finish_oauth_login(user_id: str, request: Request, response: Response):
    """Issue remember_me + auth tokens. OAuth logins always get remember_me."""
    authentication.create_remember_me_jwt(user_id, request, response)
    await authentication.get_auth_tokens(request, response, user_id)


async def link_provider_to_account(user_id: str, provider: str, scoped_sub: str):
    """Persist a new provider identifier and update linked_providers on an existing account."""
    await s3_actions.store(BUCKET, "identifier/", scoped_sub, user_id)

    account_details = await s3_actions.retrieve(BUCKET, f"accounts/{user_id}/", "account_details")
    linked = account_details.get("linked_providers", [])
    if provider not in linked:
        linked.append(provider)
    account_details["linked_providers"] = linked
    await s3_actions.store(BUCKET, "accounts/", f"{user_id}/account_details", account_details)
    logger.info(f"Linked provider '{provider}' to user_id: {user_id}")
