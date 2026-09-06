"""Application layer: one class per use case, each depending only on ports
(never on a concrete adapter). This is what makes the domain testable without
a real database and swappable without touching HTTP routes.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.domain.entities import Role, Tenant, User
from app.domain.exceptions import InvalidCredentials, TenantNotFound, TenantSlugTaken, UsernameTaken
from app.domain.ports import PasswordHasher, TenantRepository, TokenIssuer, UserRepository


@dataclass
class AuthResult:
    token: str
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    role: str


class _UseCase:
    """Shared constructor for the three use cases that issue a token."""

    def __init__(
        self,
        tenants: TenantRepository,
        users: UserRepository,
        hasher: PasswordHasher,
        tokens: TokenIssuer,
    ):
        self._tenants = tenants
        self._users = users
        self._hasher = hasher
        self._tokens = tokens

    def _result_for(self, user: User) -> AuthResult:
        return AuthResult(
            token=self._tokens.issue(user),
            user_id=user.id,
            tenant_id=user.tenant_id,
            role=user.role.value,
        )


@dataclass
class RegisterTenantInput:
    """Sign-up: creates a brand-new tenant (workspace) with its first user as
    owner. This is the SaaS's entry point - there is no "user" without a
    tenant, so signing up always creates both together."""

    tenant_slug: str
    tenant_name: str
    owner_username: str
    owner_password: str
    owner_email: Optional[str] = None


class RegisterTenant(_UseCase):
    def execute(self, data: RegisterTenantInput) -> AuthResult:
        if self._tenants.get_by_slug(data.tenant_slug) is not None:
            raise TenantSlugTaken(data.tenant_slug)

        tenant = Tenant(
            id=uuid.uuid4(),
            slug=data.tenant_slug,
            name=data.tenant_name,
            created_at=datetime.now(timezone.utc),
        )
        self._tenants.save(tenant)

        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            username=data.owner_username,
            email=data.owner_email,
            password_hash=self._hasher.hash(data.owner_password),
            role=Role.OWNER,
            created_at=datetime.now(timezone.utc),
        )
        self._users.save(user)
        return self._result_for(user)


@dataclass
class RegisterUserInput:
    """Add a member to an existing tenant (an invite flow, once there's a way
    to send one - for now this just creates the account directly)."""

    tenant_slug: str
    username: str
    password: str
    email: Optional[str] = None
    role: Role = Role.MEMBER


class RegisterUser(_UseCase):
    def execute(self, data: RegisterUserInput) -> AuthResult:
        tenant = self._tenants.get_by_slug(data.tenant_slug)
        if tenant is None:
            raise TenantNotFound(data.tenant_slug)
        if self._users.get_by_username(tenant.id, data.username) is not None:
            raise UsernameTaken(data.username)

        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            username=data.username,
            email=data.email,
            password_hash=self._hasher.hash(data.password),
            role=data.role,
            created_at=datetime.now(timezone.utc),
        )
        self._users.save(user)
        return self._result_for(user)


@dataclass
class LoginInput:
    tenant_slug: str
    username: str
    password: str


class Login(_UseCase):
    def execute(self, data: LoginInput) -> AuthResult:
        tenant = self._tenants.get_by_slug(data.tenant_slug)
        if tenant is None:
            raise InvalidCredentials()
        user = self._users.get_by_username(tenant.id, data.username)
        if user is None or not self._hasher.verify(data.password, user.password_hash):
            raise InvalidCredentials()
        return self._result_for(user)


class GetCurrentUser:
    def __init__(self, users: UserRepository, tokens: TokenIssuer):
        self._users = users
        self._tokens = tokens

    def execute(self, token: str) -> User:
        claims = self._tokens.verify(token)
        user = self._users.get_by_id(claims.user_id)
        if user is None:
            raise InvalidCredentials()
        return user
