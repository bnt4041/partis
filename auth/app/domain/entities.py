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
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


@dataclass
class Tenant:
    """A tenant is one customer's isolated workspace in the SaaS."""

    id: UUID
    slug: str
    name: str
    created_at: datetime


@dataclass
class User:
    """A user always belongs to exactly one tenant - there is no such thing
    as a user without a tenant_id, which is what makes every other part of
    the system (repositories, tokens, queries) naturally multi-tenant."""

    id: UUID
    tenant_id: UUID
    username: str
    email: Optional[str]
    password_hash: str
    role: Role
    created_at: datetime
