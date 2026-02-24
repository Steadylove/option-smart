"""Shared FastAPI dependencies."""

from fastapi import Header, HTTPException

from backend.services.longbridge import current_session
from backend.services.session import UserSession, session_manager


async def get_session(x_session_token: str = Header()) -> UserSession:
    """Extract session from request header and set it as the active session."""
    session = session_manager.get(x_session_token)
    if not session:
        raise HTTPException(401, "Session expired or invalid, please reconnect")
    session.touch()
    current_session.set(session)
    return session
