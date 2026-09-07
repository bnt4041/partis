"""Verifies the JWT issued by the auth service. Deliberately minimal: this
backend only needs to know "is there a valid, non-expired token" - it doesn't
own user/tenant data, that's the auth service's job. Shares the same
JWT_SECRET via the common .env file so both services agree on what a valid
token looks like without talking to each other directly.
"""

from typing import Optional

import jwt
from fastapi import Header, HTTPException

from .config import settings


def require_auth(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Falta el token de acceso.")
    token = authorization.split(" ", 1)[1]
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido o caducado.")
