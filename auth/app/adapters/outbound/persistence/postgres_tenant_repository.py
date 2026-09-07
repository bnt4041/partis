from typing import List, Optional
from uuid import UUID

from psycopg_pool import ConnectionPool

from app.domain.entities import Tenant
from app.domain.ports import TenantRepository

_COLUMNS = "id, slug, name, created_at"


class PostgresTenantRepository(TenantRepository):
    def __init__(self, pool: ConnectionPool):
        self._pool = pool

    def get_by_slug(self, slug: str) -> Optional[Tenant]:
        with self._pool.connection() as conn:
            row = conn.execute(f"SELECT {_COLUMNS} FROM auth.tenants WHERE slug = %s", (slug,)).fetchone()
        return self._to_entity(row) if row else None

    def get_by_id(self, tenant_id: UUID) -> Optional[Tenant]:
        with self._pool.connection() as conn:
            row = conn.execute(f"SELECT {_COLUMNS} FROM auth.tenants WHERE id = %s", (tenant_id,)).fetchone()
        return self._to_entity(row) if row else None

    def list_all(self) -> List[Tenant]:
        with self._pool.connection() as conn:
            rows = conn.execute(f"SELECT {_COLUMNS} FROM auth.tenants ORDER BY created_at DESC").fetchall()
        return [self._to_entity(row) for row in rows]

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

    @staticmethod
    def _to_entity(row) -> Tenant:
        return Tenant(id=row[0], slug=row[1], name=row[2], created_at=row[3])
