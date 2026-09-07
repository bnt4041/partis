import logging
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.adapters.inbound.http.api import router as auth_router
from app.adapters.inbound.http.dependencies import get_password_hasher, get_pool, get_user_repository
from app.config import settings
from app.domain.entities import Role, User

logger = logging.getLogger("partis.auth")

app = FastAPI(title="Partis Auth Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(",") if settings.cors_origins != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


def bootstrap_app_admin() -> None:
    """There's no public sign-up, so without a first app_admin nobody could
    ever log in to create an organization. Creates one from
    ADMIN_BOOTSTRAP_USERNAME/PASSWORD the first time the app_admin table is
    empty; a no-op on every later startup."""
    if not settings.admin_bootstrap_password:
        logger.warning("ADMIN_BOOTSTRAP_PASSWORD not set - skipping app_admin bootstrap.")
        return

    users = get_user_repository()
    if users.count_app_admins() > 0:
        return

    admin = User(
        id=uuid.uuid4(),
        tenant_id=None,
        username=settings.admin_bootstrap_username,
        email=None,
        password_hash=get_password_hasher().hash(settings.admin_bootstrap_password),
        role=Role.APP_ADMIN,
        created_at=datetime.now(timezone.utc),
    )
    users.save(admin)
    logger.info("Bootstrapped app_admin user '%s'.", admin.username)


@app.on_event("startup")
def on_startup():
    get_pool().open(wait=True, timeout=30)
    bootstrap_app_admin()


@app.on_event("shutdown")
def on_shutdown():
    get_pool().close()
