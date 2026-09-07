from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt

from app.domain.entities import User
from app.domain.exceptions import InvalidCredentials
from app.domain.ports import TokenIssuer
from app.domain.value_objects import TokenClaims


class JwtTokenIssuer(TokenIssuer):
    """Locally-signed JWTs (HS256, one shared secret). This is the adapter a
    future KeycloakTokenIssuer would replace - it would verify tokens against
    Keycloak's JWKS endpoint instead of a local secret, and issue() likely
    wouldn't exist at all (Keycloak issues its own tokens). Nothing outside
    this file and dependencies.py needs to know which one is in use."""

    def __init__(self, secret: str, expires_minutes: int, algorithm: str = "HS256"):
        self._secret = secret
        self._expires_minutes = expires_minutes
        self._algorithm = algorithm

    def issue(self, user: User) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user.id),
            "tenant_id": str(user.tenant_id) if user.tenant_id else None,
            "username": user.username,
            "role": user.role.value,
            "iat": now,
            "exp": now + timedelta(minutes=self._expires_minutes),
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def verify(self, token: str) -> TokenClaims:
        try:
            payload = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except jwt.PyJWTError as exc:
            raise InvalidCredentials() from exc
        tenant_id = payload.get("tenant_id")
        return TokenClaims(
            user_id=UUID(payload["sub"]),
            tenant_id=UUID(tenant_id) if tenant_id else None,
            username=payload["username"],
            role=payload["role"],
        )
