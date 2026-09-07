"""Ports: the interfaces the application layer depends on, implemented by
adapters/. This is the hexagonal boundary - use_cases.py only ever talks to
these abstractions, never to psycopg, bcrypt or jwt directly.

Today TokenIssuer is backed by adapters/outbound/security/jwt_token_issuer.py
(locally-signed JWTs) and the repositories are backed by Postgres. Moving to
Keycloak later means adding e.g. a KeycloakTokenIssuer (verifies tokens
against Keycloak's JWKS endpoint instead of a local secret) and/or a
KeycloakUserRepository, and wiring them in
adapters/inbound/http/dependencies.py - the use cases, the HTTP routes and
this file never need to change.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from app.domain.entities import Tenant, User
from app.domain.value_objects import TokenClaims


class TenantRepository(ABC):
    @abstractmethod
    def get_by_slug(self, slug: str) -> Optional[Tenant]: ...

    @abstractmethod
    def get_by_id(self, tenant_id: UUID) -> Optional[Tenant]: ...

    @abstractmethod
    def list_all(self) -> List[Tenant]: ...

    @abstractmethod
    def save(self, tenant: Tenant) -> None: ...


class UserRepository(ABC):
    @abstractmethod
    def get_by_username(self, tenant_id: Optional[UUID], username: str) -> Optional[User]: ...

    @abstractmethod
    def list_by_username(self, username: str) -> List[User]:
        """Every account (in any tenant, plus platform admins) using this
        username - the same email can be a separate account in more than one
        organization. Login uses this to find every candidate, then only
        keeps the ones the given password actually matches."""
        ...

    @abstractmethod
    def get_by_id(self, user_id: UUID) -> Optional[User]: ...

    @abstractmethod
    def list_by_tenant(self, tenant_id: UUID) -> List[User]: ...

    @abstractmethod
    def count_app_admins(self) -> int: ...

    @abstractmethod
    def save(self, user: User) -> None: ...

    @abstractmethod
    def delete(self, user_id: UUID) -> None: ...


class PasswordHasher(ABC):
    @abstractmethod
    def hash(self, plain_password: str) -> str: ...

    @abstractmethod
    def verify(self, plain_password: str, password_hash: str) -> bool: ...


class TokenIssuer(ABC):
    @abstractmethod
    def issue(self, user: User) -> str: ...

    @abstractmethod
    def verify(self, token: str) -> TokenClaims: ...
