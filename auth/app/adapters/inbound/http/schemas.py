from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str
    tenant_slug: Optional[str] = None  # omitted/empty => platform (app_admin) login


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: Optional[str]
    role: str


class UserResponse(BaseModel):
    id: str
    tenant_id: Optional[str]
    username: str
    email: Optional[str]
    role: str


class CreateOrganizationRequest(BaseModel):
    """Only an app_admin can call this. The slug is generated from the name -
    it's not something the caller chooses."""

    name: str = Field(min_length=2, max_length=120)
    director_username: str = Field(min_length=3, max_length=60)
    director_password: str = Field(min_length=8)
    director_email: Optional[str] = None


class OrganizationResponse(BaseModel):
    tenant_id: str
    slug: str
    name: str
    director_username: str


class OrganizationSummary(BaseModel):
    tenant_id: str
    slug: str
    name: str
    created_at: str


class CreateOrgUserRequest(BaseModel):
    """Only a director/admin can call this, and only for their own tenant -
    which role they're allowed to grant is enforced in the use case."""

    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8)
    role: str = Field(pattern=r"^(admin|musico)$")
    email: Optional[str] = None


class OrgUserSummary(BaseModel):
    user_id: str
    username: str
    email: Optional[str]
    role: str


class OrgUserResponse(BaseModel):
    user_id: str
    username: str
    role: str
