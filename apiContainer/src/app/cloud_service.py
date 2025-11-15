"""
Cloud Service Communication - Send normalized data to ML service via TLS/HTTPS
"""
import requests
import logging
from typing import Dict, Any, List
from fastapi import HTTPException, status
from app.config import get_settings
from app.security import create_basic_auth_header
from app.models import StrokePoint

logger = logging.getLogger(__name__)
settings = get_settings()


def send_to_ml_service(normalized_points: List[StrokePoint], features: Dict[str, Any]) -> Dict[str, Any]:

    try:

        payload = {
            "normalized_stroke": [
                {"x": p.x, "y": p.y, "t": p.t, "p": p.p} for p in normalized_points
            ],
            "features": features,
        }
        

        auth_header = create_basic_auth_header(
            settings.CLOUD_PROVIDER_USERNAME,
            settings.CLOUD_PROVIDER_PASSWORD
        )
        

        response = requests.post(
            settings.CLOUD_PROVIDER_ENDPOINT,
            json=payload,
            headers={
                "Authorization": auth_header,
                "Content-Type": "application/json",
            },
            timeout=settings.CLOUD_PROVIDER_TIMEOUT,
            verify=settings.CLOUD_PROVIDER_VERIFY_SSL, 
        )
        

        if response.status_code != 200:
            logger.error(f"ML Service error: {response.status_code} - {response.text}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"ML Service error: {response.status_code}"
            )
        

        ml_response = response.json()
        logger.info(f"ML Service response: {ml_response}")
        
        return ml_response
        
    except requests.exceptions.Timeout:
        logger.error(f"ML Service timeout (>{settings.CLOUD_PROVIDER_TIMEOUT}s)")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="ML Service timeout"
        )
    except requests.exceptions.SSLError as e:
        logger.error(f"TLS/SSL error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="TLS/SSL error with ML service"
        )
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Connection error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot connect to ML service"
        )
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ML Service error: {str(e)}"
        )
