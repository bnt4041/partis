from psycopg_pool import ConnectionPool

from .config import settings

# Lazy-open (open=False): the pool only actually connects on first use, so
# the app can still start (and endpoints that don't touch the database still
# work) even if DATABASE_URL is unset or postgres isn't reachable yet.
pool = ConnectionPool(settings.database_url or "postgresql://localhost/partis", min_size=1, max_size=10, open=False)


def open_pool() -> None:
    pool.open(wait=True, timeout=30)


def close_pool() -> None:
    pool.close()
