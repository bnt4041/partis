from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.adapters.inbound.http import dependencies as deps
from app.adapters.inbound.http.schemas import (
    AdminCreateOrgUserRequest,
    AdminUpdateOrgUserRequest,
    AuthResponse,
    CreateOrganizationRequest,
    CreateOrgUserRequest,
    LoginRequest,
    OrgChoiceResponse,
    OrganizationResponse,
    OrganizationSummary,
    OrgUserResponse,
    OrgUserSummary,
    UpdateOrganizationRequest,
    UserResponse,
)
from app.application.use_cases import (
    PLATFORM_SENTINEL,
    AdminCreateOrgUserInput,
    AdminUpdateOrgUserInput,
    AuthResult,
    CreateOrganizationInput,
    CreateOrgUserInput,
    LoginInput,
    OrganizationResult,
    OrgUserResult,
    UpdateOrganizationInput,
)
from app.domain.entities import Role, Tenant, User
from app.domain.exceptions import (
    AmbiguousLogin,
    InvalidCredentials,
    NotAuthorized,
    TenantNotFound,
    UserNotFound,
    UsernameTaken,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


def current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    use_case=Depends(deps.get_current_user_use_case),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Falta el token de acceso.")
    try:
        return use_case.execute(credentials.credentials)
    except InvalidCredentials:
        raise HTTPException(status_code=401, detail="Token inválido o caducado.")


def _auth_response(result: AuthResult) -> AuthResponse:
    return AuthResponse(
        access_token=result.token,
        user_id=str(result.user_id),
        tenant_id=str(result.tenant_id) if result.tenant_id else None,
        role=result.role,
    )


def _org_response(result: OrganizationResult) -> OrganizationResponse:
    return OrganizationResponse(
        tenant_id=str(result.tenant_id), slug=result.slug, name=result.name, director_username=result.director_username
    )


def _org_summary(tenant: Tenant) -> OrganizationSummary:
    return OrganizationSummary(tenant_id=str(tenant.id), slug=tenant.slug, name=tenant.name, created_at=tenant.created_at.isoformat())


def _org_user_response(result: OrgUserResult) -> OrgUserResponse:
    return OrgUserResponse(user_id=str(result.user_id), username=result.username, role=result.role)


def _user_summary(user: User) -> OrgUserSummary:
    return OrgUserSummary(user_id=str(user.id), username=user.username, email=user.email, role=user.role.value)


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, use_case=Depends(deps.get_login)):
    try:
        result = use_case.execute(
            LoginInput(username=body.username, password=body.password, tenant_slug=body.tenant_slug or None)
        )
    except AmbiguousLogin as exc:
        return AuthResponse(
            requires_organization=True,
            organizations=[
                OrgChoiceResponse(tenant_slug=c.tenant_slug or PLATFORM_SENTINEL, name=c.name) for c in exc.choices
            ],
        )
    except InvalidCredentials:
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")
    return _auth_response(result)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(current_user)):
    return UserResponse(
        id=str(user.id),
        tenant_id=str(user.tenant_id) if user.tenant_id else None,
        username=user.username,
        email=user.email,
        role=user.role.value,
    )


# ---------------------------------------------------------------------------
# App-admin: create/list organizations. There is no public sign-up - a tenant
# only comes into being through this, called by someone with role app_admin.
# ---------------------------------------------------------------------------


@router.post("/admin/organizations", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    body: CreateOrganizationRequest,
    user: User = Depends(current_user),
    use_case=Depends(deps.get_create_organization),
):
    try:
        result = use_case.execute(
            user,
            CreateOrganizationInput(
                name=body.name,
                director_username=body.director_username,
                director_password=body.director_password,
                director_email=body.director_email,
            ),
        )
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="Solo un administrador de la aplicación puede crear organizaciones.")
    return _org_response(result)


@router.get("/admin/organizations", response_model=list[OrganizationSummary])
def list_organizations(user: User = Depends(current_user), use_case=Depends(deps.get_list_organizations)):
    try:
        tenants = use_case.execute(user)
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="Solo un administrador de la aplicación puede ver las organizaciones.")
    return [_org_summary(t) for t in tenants]


@router.patch("/admin/organizations/{tenant_id}", response_model=OrganizationSummary)
def update_organization(
    tenant_id: str,
    body: UpdateOrganizationRequest,
    user: User = Depends(current_user),
    use_case=Depends(deps.get_update_organization),
):
    try:
        tenant = use_case.execute(user, UpdateOrganizationInput(tenant_id=UUID(tenant_id), name=body.name))
    except ValueError:
        raise HTTPException(status_code=422, detail="Identificador de organización inválido.")
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="Solo un administrador de la aplicación puede editar organizaciones.")
    except TenantNotFound:
        raise HTTPException(status_code=404, detail="Organización no encontrada.")
    return _org_summary(tenant)


@router.get("/admin/organizations/{tenant_id}/users", response_model=list[OrgUserSummary])
def admin_list_org_users(
    tenant_id: str,
    user: User = Depends(current_user),
    use_case=Depends(deps.get_admin_list_org_users),
):
    try:
        tenant_uuid = UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Identificador de organización inválido.")
    try:
        users = use_case.execute(user, tenant_uuid)
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="Solo un administrador de la aplicación puede ver estos usuarios.")
    return [_user_summary(u) for u in users]


@router.post("/admin/organizations/{tenant_id}/users", response_model=OrgUserSummary, status_code=status.HTTP_201_CREATED)
def admin_create_org_user(
    tenant_id: str,
    body: AdminCreateOrgUserRequest,
    user: User = Depends(current_user),
    use_case=Depends(deps.get_admin_create_org_user),
):
    try:
        tenant_uuid = UUID(tenant_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Identificador de organización inválido.")
    try:
        created = use_case.execute(
            user,
            AdminCreateOrgUserInput(
                tenant_id=tenant_uuid, username=body.username, password=body.password, role=Role(body.role), email=body.email
            ),
        )
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="Solo un administrador de la aplicación puede crear este usuario.")
    except UsernameTaken:
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso en esa organización.")
    return _user_summary(created)


@router.patch("/admin/users/{user_id}", response_model=OrgUserSummary)
def admin_update_org_user(
    user_id: str,
    body: AdminUpdateOrgUserRequest,
    user: User = Depends(current_user),
    use_case=Depends(deps.get_admin_update_org_user),
):
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Identificador de usuario inválido.")
    try:
        updated = use_case.execute(
            user,
            AdminUpdateOrgUserInput(
                user_id=user_uuid,
                username=body.username,
                role=Role(body.role) if body.role else None,
                email=body.email,
                password=body.password,
            ),
        )
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="Solo un administrador de la aplicación puede editar este usuario.")
    except UsernameTaken:
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso en esa organización.")
    except UserNotFound:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    return _user_summary(updated)


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_org_user(
    user_id: str,
    user: User = Depends(current_user),
    use_case=Depends(deps.get_admin_delete_org_user),
):
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Identificador de usuario inválido.")
    try:
        use_case.execute(user, user_uuid)
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="Solo un administrador de la aplicación puede eliminar este usuario.")
    except UserNotFound:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")


# ---------------------------------------------------------------------------
# Org director/admin: create/list the users of their own tenant.
# ---------------------------------------------------------------------------


@router.post("/org/users", response_model=OrgUserResponse, status_code=status.HTTP_201_CREATED)
def create_org_user(
    body: CreateOrgUserRequest,
    user: User = Depends(current_user),
    use_case=Depends(deps.get_create_org_user),
):
    try:
        result = use_case.execute(
            user,
            CreateOrgUserInput(username=body.username, password=body.password, role=Role(body.role), email=body.email),
        )
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="No tienes permiso para crear ese tipo de usuario.")
    except UsernameTaken:
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso en tu organización.")
    return _org_user_response(result)


@router.get("/org/users", response_model=list[OrgUserSummary])
def list_org_users(user: User = Depends(current_user), use_case=Depends(deps.get_list_org_users)):
    try:
        users = use_case.execute(user)
    except NotAuthorized:
        raise HTTPException(status_code=403, detail="Solo el director o un administrador de la organización pueden ver esta lista.")
    return [_user_summary(u) for u in users]


@router.get("/org/me", response_model=OrganizationSummary)
def get_own_organization(user: User = Depends(current_user), use_case=Depends(deps.get_own_organization)):
    try:
        tenant = use_case.execute(user)
    except TenantNotFound:
        raise HTTPException(status_code=404, detail="Tu usuario no pertenece a ninguna organización.")
    return _org_summary(tenant)
