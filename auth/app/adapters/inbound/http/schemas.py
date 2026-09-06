from typing import Optional

from pydantic import BaseModel, Field


class RegisterTenantRequest(BaseModel):
    tenant_slug: str = Field(pattern=r"^[a-z0-9-]{3,40}$", description="Identificador único de la organización, ej. 'mi-coro'")
    tenant_name: str
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8)
    email: Optional[str] = None


class RegisterUserRequest(BaseModel):
    tenant_slug: str
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8)
    email: Optional[str] = None


class LoginRequest(BaseModel):
    tenant_slug: str
    username: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: str
    role: str


class UserResponse(BaseModel):
    id: str
    tenant_id: str
    username: str
    email: Optional[str]
    role: str
