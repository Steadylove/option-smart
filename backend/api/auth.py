"""Auth API — connect / verify / disconnect using Longbridge credentials."""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from backend.api.deps import get_session
from backend.services.session import UserSession, session_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


class ConnectRequest(BaseModel):
    app_key: str
    app_secret: str
    access_token: str


class ConnectResponse(BaseModel):
    token: str


@router.post("/connect", response_model=ConnectResponse)
async def connect(body: ConnectRequest):
    """Validate Longbridge credentials and return a session token."""
    if not body.app_key or not body.app_secret or not body.access_token:
        raise HTTPException(400, "All three credential fields are required")
    try:
        token, _ = session_manager.connect(body.app_key, body.app_secret, body.access_token)
    except Exception as e:
        logger.warning("Connection failed: %s", e)
        raise HTTPException(401, f"Failed to connect to Longbridge: {e}")
    return ConnectResponse(token=token)


@router.get("/verify")
async def verify(session: UserSession = Depends(get_session)):
    """Check if the session token is still valid."""
    return {"valid": True, "token": session.token}


@router.post("/disconnect")
async def disconnect(x_session_token: str = Header(default="")):
    """Destroy a session and release its connections."""
    if x_session_token:
        session_manager.disconnect(x_session_token)
    return {"ok": True}
