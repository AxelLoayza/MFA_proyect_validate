"""
Cloud Service Communication - Send normalized data to ML service via TLS/HTTPS
"""
import requests
import logging
from typing import Dict, Any, List
from fastapi import HTTPException, status
from .config import get_settings
from .security import create_basic_auth_header
from .models import StrokePoint, NormalizationRequest
from typing import Dict, Any, List

logger = logging.getLogger(__name__)
settings = get_settings()

def send_enrollment_to_ml_service(normalized_payloads: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Envía 5 firmas ya normalizadas (pre-padding) al microservicio Cloud
    para solicitar la generación del "Master Feature".
    
    Args:
       normalized_payloads: Lista de 5 diccionarios con la estructura:
                            {"normalized_stroke": [...], "real_length": val, "features": {...}}
    """
    try:
        # Wrap en el modelo EnrollmentCloudRequest (que espera la API /api/biometric/enroll)
        payload = {
            "signatures": normalized_payloads
        }
        
        auth_header = create_basic_auth_header(
            settings.CLOUD_PROVIDER_USERNAME,
            settings.CLOUD_PROVIDER_PASSWORD
        )
        
        response = requests.post(
            f"{settings.CLOUD_PROVIDER_ENDPOINT}/api/biometric/enroll",
            json=payload,
            headers={
                "Authorization": auth_header,
                "Content-Type": "application/json",
            },
            timeout=settings.CLOUD_PROVIDER_TIMEOUT,
            verify=settings.CLOUD_PROVIDER_VERIFY_SSL,
        )
        
        if response.status_code != 200:
            logger.error(f"Error generando Master Feature: {response.status_code} - {response.text}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Cloud Service Enrollment Error: {response.text}"
            )
            
        return response.json()
        
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Cloud service timeout")
    except Exception as e:
        logger.error(f"Unexpected Cloud service error: {str(e)}")
        raise HTTPException(status_code=502, detail=str(e))
        
def send_to_ml_service(normalized_points: List[StrokePoint], features: Dict[str, Any]) -> Dict[str, Any]:

    try:
        # Extract real_length from features - cloud_service expects it as separate field at root level
        real_length = features.get("real_length")
        
        payload = {
            "normalized_stroke": [
                {"x": p.x, "y": p.y, "t": p.t, "p": p.p} for p in normalized_points
            ],
            "real_length": real_length,
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
