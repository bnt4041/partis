from psycopg_pool import ConnectionPool

from app.config import settings


def create_pool() -> ConnectionPool:
    # open=False: connect lazily on first use, so the app can start even if
    # postgres takes a moment longer to accept connections (docker compose's
    # healthcheck-based depends_on already covers the common case, this is
    # just a second line of defence).
    return ConnectionPool(settings.database_url, min_size=1, max_size=10, open=False)
