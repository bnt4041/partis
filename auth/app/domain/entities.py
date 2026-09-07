"""Domain entities: plain data, no framework/DB/HTTP concerns.

This is the innermost layer of the hexagon. Nothing here imports FastAPI,
psycopg, or jwt - those only ever appear in adapters/.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID


class Role(str, Enum):
    APP_ADMIN = "app_admin"  # platform staff - not part of any tenant, manages the SaaS itself
    DIRECTOR = "director"  # top role inside a tenant, set once when the tenant is created
    ADMIN = "admin"  # can create/manage the tenant's other users
    MUSICO = "musico"  # regular member


# Roles a DIRECTOR may grant when creating a user in their own tenant.
DIRECTOR_CAN_GRANT = {Role.ADMIN, Role.MUSICO}
# Roles an ADMIN may grant - deliberately narrower than a director's.
ADMIN_CAN_GRANT = {Role.MUSICO}


@dataclass
class Tenant:
    """A tenant is one customer's isolated workspace in the SaaS."""

    id: UUID
    slug: str
    name: str
    created_at: datetime


@dataclass
class User:
    """Almost every user belongs to exactly one tenant. The one exception is
    APP_ADMIN: platform staff aren't part of any customer's workspace, so
    their tenant_id is None - see auth.tenant_id being nullable in the DB
    schema, and the partial unique index that keeps their usernames unique
    without a tenant to scope them."""

    id: UUID
    tenant_id: Optional[UUID]
    username: str
    email: Optional[str]
    password_hash: str
    role: Role
    created_at: datetime
