from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.adapters.inbound.http import dependencies as deps
from app.adapters.inbound.http.schemas import (
    AuthResponse,
    LoginRequest,
    RegisterTenantRequest,
    RegisterUserRequest,
    UserResponse,
)
from app.application.use_cases import AuthResult, LoginInput, RegisterTenantInput, RegisterUserInput
from app.domain.entities import User
from app.domain.exceptions import InvalidCredentials, TenantNotFound, TenantSlugTaken, UsernameTaken

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


def _auth_response(result: AuthResult) -> AuthResponse:
    return AuthResponse(
        access_token=result.token,
        user_id=str(result.user_id),
        tenant_id=str(result.tenant_id),
        role=result.role,
    )


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/tenants", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register_tenant(body: RegisterTenantRequest, use_case=Depends(deps.get_register_tenant)):
    """Sign-up: creates a new tenant (workspace) and its owner user."""
    try:
        result = use_case.execute(
            RegisterTenantInput(
                tenant_slug=body.tenant_slug,
                tenant_name=body.tenant_name,
                owner_username=body.username,
                owner_password=body.password,
                owner_email=body.email,
            )
        )
    except TenantSlugTaken:
        raise HTTPException(status_code=409, detail="Ese identificador de organización ya está en uso.")
    except UsernameTaken:
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso.")
    return _auth_response(result)


@router.post("/users", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register_user(body: RegisterUserRequest, use_case=Depends(deps.get_register_user)):
    """Add a member to an existing tenant."""
    try:
        result = use_case.execute(
            RegisterUserInput(
                tenant_slug=body.tenant_slug,
                username=body.username,
                password=body.password,
                email=body.email,
            )
        )
    except TenantNotFound:
        raise HTTPException(status_code=404, detail="Organización no encontrada.")
    except UsernameTaken:
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está en uso.")
    return _auth_response(result)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, use_case=Depends(deps.get_login)):
    try:
        result = use_case.execute(
            LoginInput(tenant_slug=body.tenant_slug, username=body.username, password=body.password)
        )
    except InvalidCredentials:
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")
    return _auth_response(result)


@router.get("/me", response_model=UserResponse)
def me(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    use_case=Depends(deps.get_current_user_use_case),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Falta el token de acceso.")
    try:
        user: User = use_case.execute(credentials.credentials)
    except InvalidCredentials:
        raise HTTPException(status_code=401, detail="Token inválido o caducado.")
    return UserResponse(
        id=str(user.id),
        tenant_id=str(user.tenant_id),
        username=user.username,
        email=user.email,
        role=user.role.value,
    )
