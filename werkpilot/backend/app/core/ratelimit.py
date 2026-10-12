"""Rate-Limit (Sliding Window). Redis, wenn konfiguriert, sonst Prozessspeicher."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import get_settings

_local: dict[str, deque[float]] = defaultdict(deque)
_redis = None


def _get_redis():
    global _redis
    s = get_settings()
    if not s.redis_url:
        return None
    if _redis is None:
        import redis.asyncio as aioredis

        _redis = aioredis.from_url(s.redis_url, decode_responses=True)
    return _redis


def client_ip(request: Request) -> str:
    s = get_settings()
    if s.trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def check_rate_limit(key: str, limit: int, window_seconds: int = 60) -> bool:
    """True = erlaubt, False = Limit überschritten."""
    now = time.time()
    r = _get_redis()
    if r is not None:
        try:
            pipe = r.pipeline()
            rkey = f"rl:{key}"
            pipe.zremrangebyscore(rkey, 0, now - window_seconds)
            pipe.zadd(rkey, {str(now): now})
            pipe.zcard(rkey)
            pipe.expire(rkey, window_seconds)
            res = await pipe.execute()
            return int(res[2]) <= limit
        except Exception:
            pass  # Redis-Ausfall darf die API nicht lahmlegen → lokaler Fallback
    q = _local[key]
    while q and q[0] < now - window_seconds:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def reset_local_limits() -> None:
    _local.clear()


async def rate_limit_dependency(request: Request) -> None:
    s = get_settings()
    ok = await check_rate_limit(f"ip:{client_ip(request)}", s.rate_limit_per_minute)
    if not ok:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Zu viele Anfragen. Bitte kurz warten.")


async def auth_rate_limit(request: Request) -> None:
    s = get_settings()
    ok = await check_rate_limit(f"auth:{client_ip(request)}", s.auth_rate_limit_per_minute)
    if not ok:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Zu viele Anmeldeversuche. Bitte später erneut.")
