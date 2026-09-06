from typing import Optional

from psycopg_pool import ConnectionPool

from app.domain.entities import Tenant
from app.domain.ports import TenantRepository


class PostgresTenantRepository(TenantRepository):
    def __init__(self, pool: ConnectionPool):
        self._pool = pool

    def get_by_slug(self, slug: str) -> Optional[Tenant]:
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT id, slug, name, created_at FROM auth.tenants WHERE slug = %s",
                (slug,),
            ).fetchone()
        if row is None:
            return None
        return Tenant(id=row[0], slug=row[1], name=row[2], created_at=row[3])

    def save(self, tenant: Tenant) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                """
                INSERT INTO auth.tenants (id, slug, name, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name
                """,
                (tenant.id, tenant.slug, tenant.name, tenant.created_at),
            )
