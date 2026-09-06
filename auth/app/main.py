from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.adapters.inbound.http.api import router as auth_router
from app.adapters.inbound.http.dependencies import get_pool
from app.config import settings

app = FastAPI(title="Partis Auth Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(",") if settings.cors_origins != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.on_event("startup")
def open_db_pool():
    get_pool().open(wait=True, timeout=30)


@app.on_event("shutdown")
def close_db_pool():
    get_pool().close()
