from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class TokenClaims:
    """What a verified access token tells the rest of the system about the
    caller - who they are, and which tenant they're acting in. Every request
    that needs to know "who is this" and "which tenant's data" goes through
    this, regardless of whether the token came from our own JWT issuer or
    (later) from Keycloak."""

    user_id: UUID
    tenant_id: UUID
    username: str
    role: str
