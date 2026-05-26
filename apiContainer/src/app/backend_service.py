import logging
from typing import Any, Dict

import requests
from fastapi import HTTPException

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def forward_step_up_to_public_gateway(
    normalized_signature: Dict[str, Any],
    authorization: str,
    tenant_key: str | None = None,
    tenant_id: str | None = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "normalized_signature": normalized_signature,
    }
    if tenant_key:
        payload["tenantKey"] = tenant_key
    if tenant_id:
        payload["tenantId"] = tenant_id

    try:
        response = requests.post(
            settings.PUBLIC_GATEWAY_STEP_UP_ENDPOINT,
            json=payload,
            headers={
                "Authorization": authorization,
                "Content-Type": "application/json",
            },
            timeout=settings.CLOUD_PROVIDER_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Public Gateway step-up timeout")
    except requests.exceptions.ConnectionError as error:
        logger.error("Public Gateway connection error: %s", error)
        raise HTTPException(status_code=503, detail="Cannot connect to Public Gateway")

    if response.status_code >= 400:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)

    return response.json()
