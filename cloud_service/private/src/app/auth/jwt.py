"""
JWT Token Service with RS256 Signature
Generates and validates ARC authentication tokens
"""
import jwt
import json
import os
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)


class RSAKeyManager:
    """
    Manages RSA key pair generation, storage, and loading
    Used for JWT RS256 signature
    """
    
    def __init__(self, key_dir: str = "keys"):
        """
        Initialize RSA Key Manager
        
        Args:
            key_dir: Directory to store/load keys (default: keys/)
        """
        self.key_dir = Path(key_dir)
        self.key_dir.mkdir(exist_ok=True)
        
        self.private_key_path = self.key_dir / "private_key.pem"
        self.public_key_path = self.key_dir / "public_key.pem"
        
        self.private_key = None
        self.public_key = None
        
        self.load_or_generate_keys()
    
    def load_or_generate_keys(self):
        """Load existing keys or generate new pair"""
        if self.private_key_path.exists() and self.public_key_path.exists():
            logger.info("Loading existing RSA keys")
            self._load_keys()
        else:
            logger.warning("RSA keys not found. Generating new pair...")
            self.generate_keys()
    
    def generate_keys(self, key_size: int = 2048):
        """
        Generate new RSA key pair
        
        Args:
            key_size: RSA key size in bits (default: 2048)
        """
        logger.info(f"Generating {key_size}-bit RSA key pair...")
        
        # Generate private key
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=key_size,
            backend=default_backend()
        )
        
        # Derive public key
        public_key = private_key.public_key()
        
        # Serialize and save
        self._save_keys(private_key, public_key)
        self.private_key = private_key
        self.public_key = public_key
        
        logger.info(f"RSA keys generated and saved to {self.key_dir}")
    
    def _save_keys(self, private_key, public_key):
        """Save keys to PEM files"""
        # Save private key
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        self.private_key_path.write_bytes(private_pem)
        
        # Save public key
        public_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        self.public_key_path.write_bytes(public_pem)
        
        logger.info(f"Private key saved to {self.private_key_path}")
        logger.info(f"Public key saved to {self.public_key_path}")
    
    def _load_keys(self):
        """Load keys from PEM files"""
        private_pem = self.private_key_path.read_bytes()
        self.private_key = serialization.load_pem_private_key(
            private_pem,
            password=None,
            backend=default_backend()
        )
        
        public_pem = self.public_key_path.read_bytes()
        self.public_key = serialization.load_pem_public_key(
            public_pem,
            backend=default_backend()
        )
        
        logger.info("RSA keys loaded successfully")


class ARCTokenService:
    """
    Generates and validates ARC (Authentication Context) JWT tokens
    with RS256 signature
    """
    
    def __init__(self, key_manager: RSAKeyManager):
        """
        Initialize Token Service
        
        Args:
            key_manager: RSAKeyManager instance for key handling
        """
        self.key_manager = key_manager
        self.algorithm = "RS256"
    
    def generate_token(
        self,
        user_id: str,
        tenant_id: str,
        email: str,
        role: str,
        status: int,
        device_id: str,
        issuer: str,
        expiry_seconds: int = 300,
        acr: str = "urn:arc:level:1",
        amr: Optional[list] = None
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Generate ARC JWT token with RS256 signature
        
        Args:
            user_id: User UUID
            tenant_id: Tenant identifier
            email: User email
            role: User role (user, admin, etc.)
            status: User status (1=active)
            device_id: Device identifier
            issuer: JWT issuer (from tenant settings)
            expiry_seconds: Token expiry in seconds (default: 300)
            acr: Authentication Context Reference (default: level:1)
            amr: Authentication Methods Reference (default: ["federated", "biometric"])
            
        Returns:
            Tuple[str, Dict]: (token, payload)
        """
        
        if amr is None:
            amr = ["federated", "biometric"]
        
        now = datetime.utcnow()
        exp = now + timedelta(seconds=expiry_seconds)
        
        # Generate unique session and request IDs
        sid = self._generate_session_id()
        jti = self._generate_jti()
        
        # Build ARC token payload
        payload = {
            # Standard JWT claims
            "iss": issuer,                          # Issuer
            "sub": user_id,                         # Subject
            "jti": jti,                             # JWT ID
            "iat": int(now.timestamp()),            # Issued At
            "exp": int(exp.timestamp()),            # Expiration
            
            # Tenant context
            "tenantId": tenant_id,
            
            # User identity
            "email": email,
            "role": role,
            "status": status,
            
            # ARC claims
            "arc": {
                "acr": acr,                         # Authentication Context Reference
                "amr": amr                          # Authentication Methods Reference
            },
            
            # Device context
            "device": {
                "deviceId": device_id
            },
            
            # Session context
            "session": {
                "sid": sid                          # Session ID
            }
        }
        
        # Sign token with RS256
        token = jwt.encode(
            payload,
            self.key_manager.private_key,
            algorithm=self.algorithm
        )
        
        logger.info(f"Token generated for user {user_id} in tenant {tenant_id}")
        logger.debug(f"Token payload: {payload}")
        
        return token, payload
    
    def validate_token(self, token: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """
        Validate and decode JWT token
        
        Args:
            token: JWT token string
            
        Returns:
            Tuple[bool, payload, error_message]
            - bool: True if valid, False otherwise
            - payload: Decoded payload if valid, None otherwise
            - error_message: Error message if invalid, None otherwise
        """
        try:
            payload = jwt.decode(
                token,
                self.key_manager.public_key,
                algorithms=[self.algorithm]
            )
            logger.info(f"Token validated for user {payload.get('sub')}")
            return True, payload, None
        
        except jwt.ExpiredSignatureError:
            error = "Token has expired"
            logger.warning(f"Token validation failed: {error}")
            return False, None, error
        
        except jwt.InvalidSignatureError:
            error = "Invalid token signature"
            logger.warning(f"Token validation failed: {error}")
            return False, None, error
        
        except jwt.DecodeError:
            error = "Failed to decode token"
            logger.warning(f"Token validation failed: {error}")
            return False, None, error
        
        except Exception as e:
            error = f"Token validation error: {str(e)}"
            logger.error(error)
            return False, None, error
    
    def get_public_key_pem(self) -> str:
        """
        Get public key in PEM format (for client-side validation)
        
        Returns:
            str: Public key in PEM format
        """
        return self.key_manager.public_key_path.read_text()
    
    @staticmethod
    def _generate_session_id(prefix: str = "sess") -> str:
        """Generate unique session ID"""
        import secrets
        random_part = secrets.token_hex(4)  # 8 hex chars = 4 bytes
        return f"{prefix}_{random_part}"
    
    @staticmethod
    def _generate_jti(prefix: str = "jti") -> str:
        """Generate unique JWT ID"""
        import secrets
        random_part = secrets.token_hex(8)  # 16 hex chars = 8 bytes
        return f"{prefix}_{random_part}"


# Global instance
_token_service: Optional[ARCTokenService] = None


def init_token_service(key_dir: str = "keys") -> ARCTokenService:
    """
    Initialize global token service instance
    
    Args:
        key_dir: Directory for RSA keys
        
    Returns:
        ARCTokenService instance
    """
    global _token_service
    key_manager = RSAKeyManager(key_dir=key_dir)
    _token_service = ARCTokenService(key_manager)
    return _token_service


def get_token_service() -> ARCTokenService:
    """
    Get global token service instance
    
    Returns:
        ARCTokenService instance
        
    Raises:
        RuntimeError: If service not initialized
    """
    if _token_service is None:
        raise RuntimeError("Token service not initialized. Call init_token_service() first.")
    return _token_service
