"""IP-based security validation for internal server-to-server communication."""
import ipaddress
import logging
from fastapi import Request, HTTPException
from typing import Set

logger = logging.getLogger(__name__)

# AWS Private IP ranges (RFC 1918 private address space commonly used in VPCs)
INTERNAL_IP_RANGES = [
    ipaddress.ip_network('10.0.0.0/8'),      # Class A private
    ipaddress.ip_network('172.16.0.0/12'),   # Class B private
    ipaddress.ip_network('192.168.0.0/16'),  # Class C private
    ipaddress.ip_network('127.0.0.0/8'),     # Loopback (for local testing)
]


def is_internal_ip(ip_address: str) -> bool:
    """
    Check if an IP address is within internal AWS/private IP ranges.
    
    Args:
        ip_address: IP address string to check
        
    Returns:
        True if the IP is in an internal range, False otherwise
    """
    try:
        ip = ipaddress.ip_address(ip_address)
        return any(ip in network for network in INTERNAL_IP_RANGES)
    except ValueError:
        logger.warning(f"Invalid IP address format: {ip_address}")
        return False


async def validate_internal_request(request: Request) -> str:
    """
    FastAPI dependency that validates the request comes from an internal AWS IP.
    
    This should be used for server-to-server communication endpoints that should
    only be accessible from within the AWS infrastructure.
    
    Args:
        request: FastAPI Request object
        
    Returns:
        The client IP address if valid
        
    Raises:
        HTTPException: 403 Forbidden if the request is from an external IP
    """
    # Try to get the real client IP from various headers (reverse proxy support)
    client_ip = (
        request.headers.get('X-Real-IP') or
        request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or
        request.client.host if request.client else None
    )
    
    if not client_ip:
        logger.error("Unable to determine client IP address")
        raise HTTPException(
            status_code=403,
            detail="Unable to determine client IP address"
        )
    
    if not is_internal_ip(client_ip):
        logger.warning(
            f"Blocked external request to internal endpoint from IP: {client_ip}"
        )
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only accessible from internal servers"
        )
    
    logger.debug(f"Validated internal request from IP: {client_ip}")
    return client_ip
