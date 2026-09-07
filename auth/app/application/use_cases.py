"""Application layer: one class per use case, each depending only on ports
(never on a concrete adapter). This is what makes the domain testable without
a real database and swappable without touching HTTP routes.
"""

import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

from app.domain.entities import ADMIN_CAN_GRANT, DIRECTOR_CAN_GRANT, Role, Tenant, User
from app.domain.exceptions import (
    InvalidCredentials,
    NotAuthorized,
    TenantNotFound,
    UsernameTaken,
)
from app.domain.ports import PasswordHasher, TenantRepository, TokenIssuer, UserRepository


def slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return base or "org"


class _UseCase:
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


@dataclass
class AuthResult:
    token: str
    user_id: uuid.UUID
    tenant_id: Optional[uuid.UUID]
    role: str


@dataclass
class LoginInput:
    username: str
    password: str
    tenant_slug: Optional[str] = None  # empty/None => platform (app_admin) login


class Login(_UseCase):
    def execute(self, data: LoginInput) -> AuthResult:
        tenant_id = None
        if data.tenant_slug:
            tenant = self._tenants.get_by_slug(data.tenant_slug)
            if tenant is None:
                raise InvalidCredentials()
            tenant_id = tenant.id

        user = self._users.get_by_username(tenant_id, data.username)
        if user is None or not self._hasher.verify(data.password, user.password_hash):
            raise InvalidCredentials()
        return AuthResult(
            token=self._tokens.issue(user), user_id=user.id, tenant_id=user.tenant_id, role=user.role.value
        )


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


# ---------------------------------------------------------------------------
# App-admin: creating and listing organizations. This is the only way a
# tenant comes into existence now - there's no public sign-up.
# ---------------------------------------------------------------------------


@dataclass
class OrganizationResult:
    tenant_id: uuid.UUID
    slug: str
    name: str
    director_username: str


@dataclass
class CreateOrganizationInput:
    name: str
    director_username: str
    director_password: str
    director_email: Optional[str] = None


class CreateOrganization(_UseCase):
    def execute(self, actor: User, data: CreateOrganizationInput) -> OrganizationResult:
        if actor.role != Role.APP_ADMIN:
            raise NotAuthorized()

        slug = self._unique_slug(slugify(data.name))
        tenant = Tenant(id=uuid.uuid4(), slug=slug, name=data.name, created_at=datetime.now(timezone.utc))
        self._tenants.save(tenant)

        director = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            username=data.director_username,
            email=data.director_email,
            password_hash=self._hasher.hash(data.director_password),
            role=Role.DIRECTOR,
            created_at=datetime.now(timezone.utc),
        )
        self._users.save(director)

        return OrganizationResult(tenant_id=tenant.id, slug=tenant.slug, name=tenant.name, director_username=director.username)

    def _unique_slug(self, base: str) -> str:
        candidate = base
        for _ in range(5):
            if self._tenants.get_by_slug(candidate) is None:
                return candidate
            candidate = f"{base}-{secrets.token_hex(2)}"
        return f"{base}-{uuid.uuid4().hex[:8]}"


class ListOrganizations:
    def __init__(self, tenants: TenantRepository):
        self._tenants = tenants

    def execute(self, actor: User) -> List[Tenant]:
        if actor.role != Role.APP_ADMIN:
            raise NotAuthorized()
        return self._tenants.list_all()


# ---------------------------------------------------------------------------
# Org director/admin: creating and listing the users of their own tenant.
# ---------------------------------------------------------------------------


@dataclass
class OrgUserResult:
    user_id: uuid.UUID
    username: str
    role: str


@dataclass
class CreateOrgUserInput:
    username: str
    password: str
    role: Role
    email: Optional[str] = None


class CreateOrgUser(_UseCase):
    def execute(self, actor: User, data: CreateOrgUserInput) -> OrgUserResult:
        allowed_roles = DIRECTOR_CAN_GRANT if actor.role == Role.DIRECTOR else ADMIN_CAN_GRANT if actor.role == Role.ADMIN else set()
        if not allowed_roles or data.role not in allowed_roles:
            raise NotAuthorized()

        tenant_id = actor.tenant_id
        if tenant_id is None:  # defensive: an app_admin has no tenant to add a user to
            raise NotAuthorized()
        if self._users.get_by_username(tenant_id, data.username) is not None:
            raise UsernameTaken(data.username)

        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            username=data.username,
            email=data.email,
            password_hash=self._hasher.hash(data.password),
            role=data.role,
            created_at=datetime.now(timezone.utc),
        )
        self._users.save(user)
        return OrgUserResult(user_id=user.id, username=user.username, role=user.role.value)


class ListOrgUsers:
    def __init__(self, users: UserRepository):
        self._users = users

    def execute(self, actor: User) -> List[User]:
        if actor.role not in (Role.DIRECTOR, Role.ADMIN) or actor.tenant_id is None:
            raise NotAuthorized()
        return self._users.list_by_tenant(actor.tenant_id)


class GetOwnOrganization:
    def __init__(self, tenants: TenantRepository):
        self._tenants = tenants

    def execute(self, actor: User) -> Tenant:
        if actor.tenant_id is None:
            raise TenantNotFound("")
        tenant = self._tenants.get_by_id(actor.tenant_id)
        if tenant is None:
            raise TenantNotFound(str(actor.tenant_id))
        return tenant
