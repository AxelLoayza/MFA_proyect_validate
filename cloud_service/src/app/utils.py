"""
Utility functions for rate limiting, validation, and padding
"""
import time
from collections import defaultdict
from typing import List, Dict, Tuple
from datetime import datetime, timedelta
from fastapi import HTTPException, Request, status
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Rate limiter using sliding window algorithm
    Tracks requests per IP address
    """
    def __init__(self, max_requests: int = 20, window_seconds: int = 60):
        """
        Initialize rate limiter
        
        Args:
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # Dictionary to store request timestamps per IP
        self.requests: Dict[str, List[float]] = defaultdict(list)
        
    def check_rate_limit(self, client_ip: str) -> bool:
        """
        Check if client has exceeded rate limit
        
        Args:
            client_ip: Client IP address
            
        Returns:
            bool: True if within limit, False if exceeded
        """
        current_time = time.time()
        window_start = current_time - self.window_seconds
        
        # Get requests for this IP
        ip_requests = self.requests[client_ip]
        
        # Remove old requests outside the window
        ip_requests[:] = [req_time for req_time in ip_requests if req_time > window_start]
        
        # Check if limit exceeded
        if len(ip_requests) >= self.max_requests:
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            return False
        
        # Add current request
        ip_requests.append(current_time)
        return True
    
    def cleanup_old_entries(self):
        """Remove IPs that have no recent requests"""
        current_time = time.time()
        window_start = current_time - (self.window_seconds * 2)
        
        # Remove IPs with no recent requests
        ips_to_remove = [
            ip for ip, requests in self.requests.items()
            if not requests or max(requests, default=0) < window_start
        ]
        
        for ip in ips_to_remove:
            del self.requests[ip]


def get_client_ip(request: Request) -> str:
    """
    Extract client IP from request, considering proxy headers
    
    Args:
        request: FastAPI Request object
        
    Returns:
        str: Client IP address
    """
    # Check X-Forwarded-For header (set by proxies)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP in the chain
        return forwarded_for.split(",")[0].strip()
    
    # Check X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Fall back to direct client host
    return request.client.host if request.client else "unknown"


def validate_stroke_points(points: List, min_points: int = 100, max_points: int = 1200) -> Tuple[bool, str]:
    """
    Validate stroke points meet requirements
    
    Args:
        points: List of stroke points
        min_points: Minimum required points
        max_points: Maximum allowed points
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    num_points = len(points)
    
    if num_points < min_points:
        return False, f"Too few points: {num_points} < {min_points}"
    
    if num_points > max_points:
        return False, f"Too many points: {num_points} > {max_points}"
    
    # Validate each point has required fields
    for i, point in enumerate(points):
        if not hasattr(point, 'x') or not hasattr(point, 'y'):
            return False, f"Point {i} missing x or y coordinate"
        if not hasattr(point, 't') or not hasattr(point, 'p'):
            return False, f"Point {i} missing timestamp or pressure"
    
    return True, ""


def apply_linear_interpolation_padding(points: List, target_points: int = 100) -> List:
    """
    Apply linear interpolation padding to reach target number of points
    
    Args:
        points: Original stroke points
        target_points: Desired number of points
        
    Returns:
        List: Padded stroke points
    """
    num_points = len(points)
    
    # If already at or above target, return as-is
    if num_points >= target_points:
        return points
    
    logger.info(f"Applying padding: {num_points} -> {target_points} points")
    
    # Calculate how many points to add
    points_to_add = target_points - num_points
    
    # Create new list with interpolated points
    padded_points = []
    
    # Calculate interval for inserting interpolated points
    interval = num_points / points_to_add if points_to_add > 0 else num_points
    
    insert_counter = 0.0
    points_added = 0
    
    for i in range(num_points):
        # Add original point
        padded_points.append(points[i])
        
        # Check if we should insert interpolated point(s)
        if i < num_points - 1 and points_added < points_to_add:
            insert_counter += 1.0
            
            # Insert interpolated point between current and next
            while insert_counter >= interval and points_added < points_to_add:
                # Interpolate between points[i] and points[i+1]
                t = 0.5  # Midpoint interpolation
                
                interpolated = type(points[i])(
                    x=points[i].x + (points[i+1].x - points[i].x) * t,
                    y=points[i].y + (points[i+1].y - points[i].y) * t,
                    t=int(points[i].t + (points[i+1].t - points[i].t) * t),
                    p=points[i].p + (points[i+1].p - points[i].p) * t
                )
                
                padded_points.append(interpolated)
                points_added += 1
                insert_counter -= interval
    
    logger.info(f"Padding complete: {len(padded_points)} points")
    return padded_points


def calculate_basic_features(points: List) -> Dict:
    """
    Calculate basic features from stroke points
    (Fallback if features not provided)
    
    Args:
        points: List of stroke points
        
    Returns:
        Dict: Calculated features
    """
    if len(points) < 2:
        return {
            "num_points": len(points),
            "total_distance": 0.0,
            "velocity_mean": 0.0,
            "velocity_max": 0.0,
            "duration_ms": 0
        }
    
    total_distance = 0.0
    velocities = []
    
    for i in range(len(points) - 1):
        # Calculate distance
        dx = points[i+1].x - points[i].x
        dy = points[i+1].y - points[i].y
        distance = (dx**2 + dy**2)**0.5
        total_distance += distance
        
        # Calculate velocity
        dt = points[i+1].t - points[i].t
        if dt > 0:
            velocity = distance / dt
            velocities.append(velocity)
    
    duration_ms = points[-1].t - points[0].t if len(points) > 0 else 0
    
    return {
        "num_points": len(points),
        "total_distance": round(total_distance, 2),
        "velocity_mean": round(sum(velocities) / len(velocities), 2) if velocities else 0.0,
        "velocity_max": round(max(velocities), 2) if velocities else 0.0,
        "duration_ms": duration_ms
    }
