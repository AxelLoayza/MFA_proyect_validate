"""
Authentication middleware for Basic Auth
"""
import base64
import secrets
from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import os
from dotenv import load_dotenv

load_dotenv()

security = HTTPBasic()

# Load credentials from environment
EXPECTED_USERNAME = os.getenv("ML_SERVICE_USERNAME", "bmfa_user")
EXPECTED_PASSWORD = os.getenv("ML_SERVICE_PASSWORD", "your_secure_password_here")


def verify_credentials(credentials: HTTPBasicCredentials = Security(security)) -> bool:
    """
    Verify Basic Auth credentials using constant-time comparison
    to prevent timing attacks
    
    Args:
        credentials: HTTPBasicCredentials from request header
        
    Returns:
        bool: True if credentials are valid
        
    Raises:
        HTTPException: 401 if credentials are invalid
    """
    # Use secrets.compare_digest for constant-time comparison
    correct_username = secrets.compare_digest(
        credentials.username.encode("utf8"),
        EXPECTED_USERNAME.encode("utf8")
    )
    correct_password = secrets.compare_digest(
        credentials.password.encode("utf8"),
        EXPECTED_PASSWORD.encode("utf8")
    )
    
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    
    return True


def get_auth_header(username: str, password: str) -> str:
    """
    Generate Basic Auth header value
    
    Args:
        username: Username
        password: Password
        
    Returns:
        str: Base64 encoded credentials
    """
    credentials = f"{username}:{password}"
    encoded = base64.b64encode(credentials.encode("utf8")).decode("utf8")
    return f"Basic {encoded}"
