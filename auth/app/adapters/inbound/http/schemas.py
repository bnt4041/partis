from typing import List, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str
    # Omitted on the first attempt: the backend looks for every account with
    # this username and checks the password against each. A real slug (or
    # the "__platform__" sentinel from a previous AuthResponse.organizations
    # entry) resolves one specific account directly - used for the
    # follow-up call once the caller has picked which organization.
    tenant_slug: Optional[str] = None


class OrgChoiceResponse(BaseModel):
    tenant_slug: str  # "__platform__" for the platform-admin account
    name: str


class AuthResponse(BaseModel):
    """Either a normal successful login (access_token set), or - when the
    username/password matches more than one account - a list to choose from
    (organizations set, access_token absent). In the latter case, log in
    again with tenant_slug set to the chosen organizations[i].tenant_slug."""

    access_token: Optional[str] = None
    token_type: str = "bearer"
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    role: Optional[str] = None
    requires_organization: bool = False
    organizations: Optional[List[OrgChoiceResponse]] = None


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
    director_username: str = Field(min_length=3, max_length=120, description="Usuario del director; puede ser su email.")
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


class UpdateOrganizationRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class CreateOrgUserRequest(BaseModel):
    """Only a director/admin can call this, and only for their own tenant -
    which role they're allowed to grant is enforced in the use case."""

    username: str = Field(min_length=3, max_length=120, description="Usuario; puede ser su email.")
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
