"""Composition root: this is the one place that wires concrete adapters into
the application layer's use cases. To move a piece of this to Keycloak later
(e.g. token verification), add the new adapter under adapters/outbound/ and
change only the corresponding get_*() function here - use_cases.py and api.py
stay untouched.
"""

from functools import lru_cache

from psycopg_pool import ConnectionPool

from app.adapters.outbound.persistence.database import create_pool
from app.adapters.outbound.persistence.postgres_tenant_repository import PostgresTenantRepository
from app.adapters.outbound.persistence.postgres_user_repository import PostgresUserRepository
from app.adapters.outbound.security.bcrypt_password_hasher import BcryptPasswordHasher
from app.adapters.outbound.security.jwt_token_issuer import JwtTokenIssuer
from app.application.use_cases import (
    AdminCreateOrgUser,
    AdminDeleteOrgUser,
    AdminListOrgUsers,
    AdminUpdateOrgUser,
    CreateOrganization,
    CreateOrgUser,
    GetCurrentUser,
    GetOwnOrganization,
    ListOrganizations,
    ListOrgUsers,
    Login,
    UpdateOrganization,
)
from app.config import settings


@lru_cache
def get_pool() -> ConnectionPool:
    return create_pool()


@lru_cache
def get_tenant_repository() -> PostgresTenantRepository:
    return PostgresTenantRepository(get_pool())


@lru_cache
def get_user_repository() -> PostgresUserRepository:
    return PostgresUserRepository(get_pool())


@lru_cache
def get_password_hasher() -> BcryptPasswordHasher:
    return BcryptPasswordHasher()


@lru_cache
def get_token_issuer() -> JwtTokenIssuer:
    return JwtTokenIssuer(secret=settings.jwt_secret, expires_minutes=settings.jwt_expires_minutes)


def get_login() -> Login:
    return Login(get_tenant_repository(), get_user_repository(), get_password_hasher(), get_token_issuer())


def get_current_user_use_case() -> GetCurrentUser:
    return GetCurrentUser(get_user_repository(), get_token_issuer())


def get_create_organization() -> CreateOrganization:
    return CreateOrganization(get_tenant_repository(), get_user_repository(), get_password_hasher(), get_token_issuer())


def get_list_organizations() -> ListOrganizations:
    return ListOrganizations(get_tenant_repository())


def get_create_org_user() -> CreateOrgUser:
    return CreateOrgUser(get_tenant_repository(), get_user_repository(), get_password_hasher(), get_token_issuer())


def get_list_org_users() -> ListOrgUsers:
    return ListOrgUsers(get_user_repository())


def get_own_organization() -> GetOwnOrganization:
    return GetOwnOrganization(get_tenant_repository())


def get_update_organization() -> UpdateOrganization:
    return UpdateOrganization(get_tenant_repository())


def get_admin_list_org_users() -> AdminListOrgUsers:
    return AdminListOrgUsers(get_user_repository())


def get_admin_create_org_user() -> AdminCreateOrgUser:
    return AdminCreateOrgUser(get_tenant_repository(), get_user_repository(), get_password_hasher(), get_token_issuer())


def get_admin_update_org_user() -> AdminUpdateOrgUser:
    return AdminUpdateOrgUser(get_tenant_repository(), get_user_repository(), get_password_hasher(), get_token_issuer())


def get_admin_delete_org_user() -> AdminDeleteOrgUser:
    return AdminDeleteOrgUser(get_user_repository())
