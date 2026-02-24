"""User session management — per-user Longbridge connections stored in memory."""

import hashlib
import logging
import time

from longport.openapi import Config, QuoteContext, TradeContext

logger = logging.getLogger(__name__)

SESSION_MAX_IDLE_SECONDS = 7 * 24 * 3600  # 7 days


class UserSession:
    """Holds a single user's Longbridge connection state."""

    def __init__(self, app_key: str, app_secret: str, access_token: str, token: str):
        self.token = token
        self.config = Config(
            app_key=app_key,
            app_secret=app_secret,
            access_token=access_token,
        )
        self._quote_ctx: QuoteContext | None = None
        self._trade_ctx: TradeContext | None = None
        self.created_at = time.monotonic()
        self.last_active = time.monotonic()

    @property
    def quote_ctx(self) -> QuoteContext:
        if self._quote_ctx is None:
            self._quote_ctx = QuoteContext(self.config)
            logger.info("QuoteContext initialized for session %s…", self.token[:8])
        return self._quote_ctx

    @property
    def trade_ctx(self) -> TradeContext:
        if self._trade_ctx is None:
            self._trade_ctx = TradeContext(self.config)
            logger.info("TradeContext initialized for session %s…", self.token[:8])
        return self._trade_ctx

    def touch(self) -> None:
        self.last_active = time.monotonic()


class SessionManager:
    """Manages all active user sessions in memory."""

    def __init__(self):
        self._sessions: dict[str, UserSession] = {}

    @staticmethod
    def _make_token(app_key: str, app_secret: str, access_token: str) -> str:
        raw = f"{app_key}:{app_secret}:{access_token}"
        return hashlib.sha256(raw.encode()).hexdigest()

    def connect(self, app_key: str, app_secret: str, access_token: str) -> tuple[str, UserSession]:
        """Create or reuse a session. Validates by initializing QuoteContext."""
        token = self._make_token(app_key, app_secret, access_token)

        if token in self._sessions:
            session = self._sessions[token]
            session.touch()
            logger.info("Reusing existing session %s…", token[:8])
            return token, session

        session = UserSession(app_key, app_secret, access_token, token)
        # Validate credentials by initializing QuoteContext (will raise on bad creds)
        _ = session.quote_ctx
        self._sessions[token] = session
        logger.info("New session created: %s…", token[:8])
        return token, session

    def get(self, token: str) -> UserSession | None:
        return self._sessions.get(token)

    def disconnect(self, token: str) -> None:
        session = self._sessions.pop(token, None)
        if session:
            logger.info("Session disconnected: %s…", token[:8])

    def first_session(self) -> UserSession | None:
        """Return any active session (for background tasks)."""
        if self._sessions:
            return next(iter(self._sessions.values()))
        return None

    def all_sessions(self) -> list[UserSession]:
        return list(self._sessions.values())

    def cleanup_stale(self) -> int:
        """Remove sessions idle longer than SESSION_MAX_IDLE_SECONDS."""
        now = time.monotonic()
        stale = [
            token
            for token, s in self._sessions.items()
            if (now - s.last_active) > SESSION_MAX_IDLE_SECONDS
        ]
        for token in stale:
            logger.info(
                "Evicting idle session %s… (inactive %.1f days)",
                token[:8],
                (now - self._sessions[token].last_active) / 86400,
            )
            self._sessions.pop(token, None)
        return len(stale)


session_manager = SessionManager()
