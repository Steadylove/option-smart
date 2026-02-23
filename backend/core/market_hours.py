"""US stock market trading hours detection with DST/ST awareness."""

from datetime import datetime, time
from zoneinfo import ZoneInfo

_ET = ZoneInfo("America/New_York")
_MARKET_OPEN = time(9, 30)
_MARKET_CLOSE = time(16, 0)


def is_us_market_open(now: datetime | None = None) -> bool:
    """Check if US stock market is currently in regular trading hours.

    Handles DST/ST automatically via America/New_York timezone.
    Returns False on weekends.
    """
    et_now = (now or datetime.now(_ET)).astimezone(_ET)

    # Weekdays only (Mon=0 .. Fri=4)
    if et_now.weekday() > 4:
        return False

    return _MARKET_OPEN <= et_now.time() < _MARKET_CLOSE
