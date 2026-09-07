from dataclasses import dataclass
from typing import Optional
from uuid import UUID


@dataclass(frozen=True)
class TokenClaims:
    """What a verified access token tells the rest of the system about the
    caller - who they are, and which tenant they're acting in (None for an
    APP_ADMIN, who isn't scoped to any tenant). Every request that needs to
    know "who is this" and "which tenant's data" goes through this,
    regardless of whether the token came from our own JWT issuer or (later)
    from Keycloak."""

    user_id: UUID
    tenant_id: Optional[UUID]
    username: str
    role: str


@dataclass(frozen=True)
class OrgChoice:
    """One candidate account offered during login disambiguation. slug=None
    means the platform-admin account, which has no organization."""

    tenant_slug: Optional[str]
    name: str
