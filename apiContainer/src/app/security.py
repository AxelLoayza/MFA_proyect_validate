"""
Security Module - JWT validation and signature verification
"""
import jwt
from pathlib import Path
from fastapi import HTTPException, status
from datetime import datetime
import base64
from .config import get_settings

settings = get_settings()


def validate_jwt_token(token: str) -> dict:
    """
    Validate JWT token from identity provider
    
    Args:
        token: JWT token string
        
    Returns:
        dict: Decoded token payload
        
    Raises:
        HTTPException: If token is invalid
    """
    try:
        # In development, allow empty key file
        jwt_key_path = Path(settings.JWT_PUBLIC_KEY_PATH)
        
        if not jwt_key_path.exists():
            # Development mode: accept token without validation
            print("⚠️  JWT validation disabled (key file not found)")
            return jwt.decode(token, options={"verify_signature": False}, algorithms=["RS256"])
        
        with open(jwt_key_path, 'r') as f:
            public_key = f.read()
        
        payload = jwt.decode(
            token,
            public_key,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
        )
        return payload
        
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation error: {str(e)}"
        )


def validate_signature_provider(username: str, password: str) -> bool:
    """
    Validate credentials against signature provider
    
    Args:
        username: Username from request
        password: Password from request
        
    Returns:
        bool: True if valid, False otherwise
    """
    return (
        username == settings.SIGNATURE_PROVIDER_USERNAME and
        password == settings.SIGNATURE_PROVIDER_PASSWORD
    )


def create_basic_auth_header(username: str, password: str) -> str:
    """
    Create HTTP Basic Authentication header
    
    Args:
        username: Username for auth
        password: Password for auth
        
    Returns:
        str: Authorization header value
    """
    credentials = f"{username}:{password}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded}"
