"""
Rate Limiter - Protect against abuse and DoS attacks
Limits requests per user/IP to prevent overload
"""
from fastapi import HTTPException, Request, status
from typing import Dict
from datetime import datetime, timedelta
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Simple in-memory rate limiter
    Tracks requests per identifier (IP or user) within time window
    """
    
    def __init__(self, max_requests: int = 8, window_seconds: int = 60):
        """
        Args:
            max_requests: Maximum requests allowed in time window
            window_seconds: Time window in seconds (default 60 = 1 minute)
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, list] = defaultdict(list)
    
    def _clean_old_requests(self, identifier: str, now: datetime) -> None:
        """Remove requests older than the time window"""
        cutoff = now - timedelta(seconds=self.window_seconds)
        self.requests[identifier] = [
            req_time for req_time in self.requests[identifier]
            if req_time > cutoff
        ]
    
    def check_rate_limit(self, identifier: str) -> bool:
        """
        Check if identifier is within rate limit
        
        Args:
            identifier: Unique identifier (IP address, user ID, etc)
            
        Returns:
            bool: True if within limit, False if exceeded
        """
        now = datetime.now()
        
        # Clean old requests
        self._clean_old_requests(identifier, now)
        
        # Check current count
        current_count = len(self.requests[identifier])
        
        if current_count >= self.max_requests:
            logger.warning(
                f"Rate limit exceeded for {identifier}: "
                f"{current_count}/{self.max_requests} requests in last {self.window_seconds}s"
            )
            return False
        
        # Add current request
        self.requests[identifier].append(now)
        return True
    
    def get_identifier(self, request: Request) -> str:
        """
        Extract identifier from request
        Uses client IP address as identifier
        
        Args:
            request: FastAPI Request object
            
        Returns:
            str: Identifier for rate limiting
        """
        # Try to get real IP from headers (if behind proxy)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        # Fall back to direct client IP
        if request.client:
            return request.client.host
        
        return "unknown"


# Global rate limiter instance
_rate_limiter: RateLimiter | None = None


def get_rate_limiter(max_requests: int = 8) -> RateLimiter:
    """Get or create rate limiter singleton"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter(max_requests=max_requests, window_seconds=60)
    return _rate_limiter


async def rate_limit_dependency(request: Request) -> None:
    """
    FastAPI dependency for rate limiting
    Raises HTTPException if limit exceeded
    """
    from app.config import get_settings
    settings = get_settings()
    
    limiter = get_rate_limiter(max_requests=settings.RATE_LIMIT_REQUESTS)
    identifier = limiter.get_identifier(request)
    
    if not limiter.check_rate_limit(identifier):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: max {settings.RATE_LIMIT_REQUESTS} requests per minute"
        )
