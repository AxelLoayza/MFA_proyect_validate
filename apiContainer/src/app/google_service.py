"""
Google OAuth Service - SDK intermediario
Delega verificación de Google tokens a Cloud Service

Flujo:
1. Backend Node.js → ApiContainer recibe id_token
2. ApiContainer (este servicio) → Cloud Service
3. Cloud Service verifica con Google y retorna ARC 0.5
"""

import os
import logging
import requests
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

CLOUD_SERVICE_URL = os.getenv("CLOUD_SERVICE_URL", "http://localhost:4003")
SDK_API_KEY = os.getenv("SDK_API_KEY", "sdk_default_key")


async def verify_google_token(id_token: str) -> Dict[str, Any]:
    """
    Verifica Google id_token con Cloud Service
    
    Flujo:
    1. Recibe id_token de Backend Node.js
    2. Envía a Cloud Service con X-SDK-Key
    3. Cloud Service verifica con Google (tiene CLIENT_SECRET)
    4. Retorna ARC 0.5 token
    
    Args:
        id_token: Token JWT de Google
        
    Returns:
        {
            "success": True,
            "access_token": "arc_0.5_token",
            "arc": "0.5",
            "amr": ["federated"],
            "user": {...},
            "arcSessionId": "..."
        }
    """
    
    try:
        logger.info("[SDK Google] Enviando id_token a Cloud Service para verificación")
        
        # Preparar payload
        payload = {
            "id_token": id_token
        }
        
        # Headers con SDK Key
        headers = {
            "X-SDK-Key": SDK_API_KEY,
            "Content-Type": "application/json"
        }
        
        # URL del endpoint en Cloud Service
        cloud_endpoint = f"{CLOUD_SERVICE_URL}/auth/google/verify-arc-05"
        
        logger.info(f"[SDK Google] POST a {cloud_endpoint}")
        
        # Hacer request a Cloud Service
        response = requests.post(
            cloud_endpoint,
            json=payload,
            headers=headers,
            timeout=10
        )
        
        # Validar respuesta
        if response.status_code != 200:
            logger.error(f"[SDK Google] Cloud Service retornó {response.status_code}")
            logger.error(f"[SDK Google] Respuesta: {response.text}")
            raise Exception(
                f"Cloud Service error: {response.status_code} - {response.text}"
            )
        
        result = response.json()
        
        logger.info(f"[SDK Google] ✓ Cloud Service retornó ARC {result.get('arc')} token")
        
        return {
            "success": True,
            "access_token": result.get("access_token"),
            "arc": result.get("arc"),
            "amr": result.get("amr", ["federated"]),
            "user": result.get("user"),
            "arcSessionId": result.get("arcSessionId"),
            "expiresIn": result.get("expires_in", 3600)
        }
        
    except requests.exceptions.Timeout:
        logger.error("[SDK Google] Timeout conectando a Cloud Service")
        raise Exception("Cloud Service timeout")
    except requests.exceptions.ConnectionError as e:
        logger.error(f"[SDK Google] Error de conexión: {str(e)}")
        raise Exception("Cloud Service unavailable")
    except Exception as e:
        logger.error(f"[SDK Google] Error: {str(e)}")
        raise


async def exchange_google_code(code: str, redirect_uri: str = None) -> Dict[str, Any]:
    """
    Intercambia authorization_code por ARC 0.5 token
    
    Flujo Code Flow + PKCE:
    1. Recibe authorization_code de Backend Node.js
    2. Envía a Cloud Service para intercambiar con Google (Cloud tiene CLIENT_SECRET)
    3. Cloud Service intercambia, extrae datos de Google, firma ARC 0.5
    4. Retorna ARC 0.5 token
    
    Args:
        code: Authorization code de Google
        redirect_uri: URI de redirección (debe coincidir con lo registrado en Google)
        
    Returns:
        {
            "success": True,
            "access_token": "arc_0.5_token",
            "arc": "0.5",
            "amr": ["federated"],
            "user": {...},
            "arcSessionId": "..."
        }
    """
    
    try:
        logger.info("[SDK Google Code Exchange] Intercambiando authorization_code con Cloud Service")
        
        if not code:
            raise Exception("Authorization code requerido")
        
        # Preparar payload
        payload = {
            "code": code,
            "redirect_uri": redirect_uri or "https://localhost:4000/api/auth/callback/google"
        }
        
        # Headers con SDK Key
        headers = {
            "X-SDK-Key": SDK_API_KEY,
            "Content-Type": "application/json"
        }
        
        # URL del endpoint en Cloud Service
        cloud_endpoint = f"{CLOUD_SERVICE_URL}/auth/google/exchange"
        
        logger.info(f"[SDK Google Code Exchange] POST a {cloud_endpoint}")
        
        # Hacer request a Cloud Service
        response = requests.post(
            cloud_endpoint,
            json=payload,
            headers=headers,
            timeout=10
        )
        
        # Validar respuesta
        if response.status_code != 200:
            logger.error(f"[SDK Google Code Exchange] Cloud Service retornó {response.status_code}")
            logger.error(f"[SDK Google Code Exchange] Respuesta: {response.text}")
            raise Exception(
                f"Cloud Service error: {response.status_code} - {response.text}"
            )
        
        result = response.json()
        
        logger.info(f"[SDK Google Code Exchange] ✓ Cloud Service retornó ARC {result.get('arc')} token")
        
        return {
            "success": True,
            "access_token": result.get("access_token"),
            "arc": result.get("arc"),
            "amr": result.get("amr", ["federated"]),
            "user": result.get("user"),
            "arcSessionId": result.get("arcSessionId"),
            "expiresIn": result.get("expires_in", 3600)
        }
        
    except requests.exceptions.Timeout:
        logger.error("[SDK Google Code Exchange] Timeout conectando a Cloud Service")
        raise Exception("Cloud Service timeout")
    except requests.exceptions.ConnectionError as e:
        logger.error(f"[SDK Google Code Exchange] Error de conexión: {str(e)}")
        raise Exception("Cloud Service unavailable")
    except Exception as e:
        logger.error(f"[SDK Google Code Exchange] Error: {str(e)}")
        raise


async def verify_google_access(access_token: str) -> Dict[str, Any]:
    """
    Verifica Google access_token con Cloud Service (cuando no hay id_token disponible)
    """
    try:
        logger.info("[SDK Google] Enviando access_token a Cloud Service para verificación")

        if not access_token:
            raise Exception('Google access_token requerido')

        payload = {"access_token": access_token}

        headers = {"X-SDK-Key": SDK_API_KEY, "Content-Type": "application/json"}
        cloud_endpoint = f"{CLOUD_SERVICE_URL}/auth/google/verify-access"

        logger.info(f"[SDK Google] POST a {cloud_endpoint}")

        response = requests.post(cloud_endpoint, json=payload, headers=headers, timeout=10)

        if response.status_code != 200:
            logger.error(f"[SDK Google] Cloud Service retornó {response.status_code}")
            logger.error(f"[SDK Google] Respuesta: {response.text}")
            raise Exception(f"Cloud Service error: {response.status_code} - {response.text}")

        result = response.json()

        logger.info(f"[SDK Google] ✓ Cloud Service retornó ARC {result.get('arc')} token (access_token flow)")

        return {
            "success": True,
            "access_token": result.get("access_token"),
            "arc": result.get("arc"),
            "amr": result.get("amr", ["federated"]),
            "user": result.get("user"),
            "arcSessionId": result.get("arcSessionId"),
            "expiresIn": result.get("expires_in", 3600)
        }

    except Exception as e:
        logger.error(f"[SDK Google] Error (access): {str(e)}")
        raise
