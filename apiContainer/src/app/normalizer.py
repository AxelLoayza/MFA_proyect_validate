"""
Biometric Data Normalizer - Padding and normalization logic
"""
from typing import List, Tuple, Dict, Any
import math
from app.models import StrokePoint, NormalizationRequest
from app.config import get_settings

settings = get_settings()


def normalize_stroke(request: NormalizationRequest) -> Tuple[List[StrokePoint], Dict[str, Any]]:
    """
    Normalize stroke points by applying padding if necessary
    
    Args:
        request: NormalizationRequest with stroke data
        
    Returns:
        tuple: (normalized_points, features_dict)
    """
    points = request.stroke_points
    num_points = len(points)
    real_length = num_points  # Capturar longitud original antes del padding
    

    if num_points < settings.MIN_STROKE_POINTS:

        normalized = apply_padding(points, settings.MIN_STROKE_POINTS, settings.PADDING_STRATEGY)
    elif num_points > settings.MAX_STROKE_POINTS:
        raise ValueError(f"Too many points: {num_points} > {settings.MAX_STROKE_POINTS}")
    else:
  
        normalized = points
    

    features = extract_features(normalized, request.stroke_duration_ms, real_length)
    
    return normalized, features


def apply_padding(points: List[StrokePoint], target_count: int, strategy: str = "linear_interpolation") -> List[StrokePoint]:
    """
    Apply padding to stroke points if there are fewer than required
    
    Args:
        points: Original stroke points
        target_count: Target number of points
        strategy: "linear_interpolation" or "repeat_last"
        
    Returns:
        List[StrokePoint]: Padded points
    """
    if len(points) >= target_count:
        return points
    
    if strategy == "linear_interpolation":
        return linear_interpolation_padding(points, target_count)
    elif strategy == "repeat_last":
        return repeat_last_padding(points, target_count)
    else:
        raise ValueError(f"Unknown padding strategy: {strategy}")


def linear_interpolation_padding(points: List[StrokePoint], target_count: int) -> List[StrokePoint]:

    if len(points) == 1:
        
        return [StrokePoint(x=points[0].x, y=points[0].y, t=points[0].t, p=points[0].p) for _ in range(target_count)]
    
    current_count = len(points)
    needed = target_count - current_count
    
    if needed <= 0:
        return points[:target_count]
    
    
    num_segments = len(points) - 1
    points_per_segment = needed // num_segments
    extra_points = needed % num_segments
    
    padded = []
    for i in range(len(points) - 1):
        padded.append(points[i])
        
        
        num_to_insert = points_per_segment + (1 if i < extra_points else 0)
        
        if num_to_insert > 0:
            p1 = points[i]
            p2 = points[i + 1]
            
            for j in range(1, num_to_insert + 1):
                t = j / (num_to_insert + 1)
                x = p1.x + (p2.x - p1.x) * t
                y = p1.y + (p2.y - p1.y) * t
                time = int(p1.t + (p2.t - p1.t) * t)
                pressure = p1.p + (p2.p - p1.p) * t
                
                padded.append(StrokePoint(x=x, y=y, t=time, p=pressure))
    
    padded.append(points[-1])
    
    
    while len(padded) < target_count:
        last = padded[-1]
        padded.append(StrokePoint(x=last.x, y=last.y, t=last.t + 1, p=last.p))
    
    return padded[:target_count]


def repeat_last_padding(points: List[StrokePoint], target_count: int) -> List[StrokePoint]:
    """
    Pad by repeating the last point (simple padding)
    Creates new StrokePoint instances with incremented time
    """
    padded = list(points)
    if not padded:
        return []
    
    last_point = padded[-1]
    time_increment = 1
    
    while len(padded) < target_count:
        padded.append(StrokePoint(
            x=last_point.x,
            y=last_point.y,
            t=last_point.t + time_increment,
            p=last_point.p
        ))
        time_increment += 1
    
    return padded[:target_count]


def extract_features(points: List[StrokePoint], duration_ms: int, real_length: int) -> Dict[str, Any]:
    """
    Extract biometric features from normalized stroke
    
    Args:
        points: Normalized stroke points
        duration_ms: Total stroke duration in milliseconds
        real_length: Original number of points before padding
        
    Returns:
        dict: Feature dictionary
    """
    if not points or len(points) < 2:
        return {
            "num_points": len(points),
            "real_length": real_length,
            "total_distance": 0.0,
            "velocity_mean": 0.0,
            "velocity_max": 0.0,
            "duration_ms": duration_ms,
        }
    
    
    total_distance = 0.0
    velocities = []
    
    for i in range(1, len(points)):
        dx = points[i].x - points[i-1].x
        dy = points[i].y - points[i-1].y
        distance = math.sqrt(dx**2 + dy**2)
        total_distance += distance
        
        
        time_diff_ms = points[i].t - points[i-1].t
        if time_diff_ms > 0:
            time_diff_s = time_diff_ms / 1000.0
            velocity = distance / time_diff_s
            velocities.append(velocity)
    
    
    velocity_mean = sum(velocities) / len(velocities) if velocities else 0.0
    velocity_max = max(velocities) if velocities else 0.0
    
    return {
        "num_points": len(points),
        "real_length": real_length,
        "total_distance": round(total_distance, 2),
        "velocity_mean": round(velocity_mean, 2),
        "velocity_max": round(velocity_max, 2),
        "duration_ms": duration_ms,
    }
