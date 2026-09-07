from typing import List, Optional
from uuid import UUID

from psycopg_pool import ConnectionPool

from app.domain.entities import Role, User
from app.domain.ports import UserRepository

_COLUMNS = "id, tenant_id, username, email, password_hash, role, created_at"


class PostgresUserRepository(UserRepository):
    def __init__(self, pool: ConnectionPool):
        self._pool = pool

    def get_by_username(self, tenant_id: Optional[UUID], username: str) -> Optional[User]:
        with self._pool.connection() as conn:
            if tenant_id is None:
                # NULL never equals anything in SQL, "tenant_id = NULL" would
                # never match - app_admins (tenant_id IS NULL) need this
                # spelled out separately.
                row = conn.execute(
                    f"SELECT {_COLUMNS} FROM auth.users WHERE tenant_id IS NULL AND username = %s",
                    (username,),
                ).fetchone()
            else:
                row = conn.execute(
                    f"SELECT {_COLUMNS} FROM auth.users WHERE tenant_id = %s AND username = %s",
                    (tenant_id, username),
                ).fetchone()
        return self._to_entity(row) if row else None

    def list_by_username(self, username: str) -> List[User]:
        with self._pool.connection() as conn:
            rows = conn.execute(f"SELECT {_COLUMNS} FROM auth.users WHERE username = %s", (username,)).fetchall()
        return [self._to_entity(row) for row in rows]

    def get_by_id(self, user_id: UUID) -> Optional[User]:
        with self._pool.connection() as conn:
            row = conn.execute(f"SELECT {_COLUMNS} FROM auth.users WHERE id = %s", (user_id,)).fetchone()
        return self._to_entity(row) if row else None

    def list_by_tenant(self, tenant_id: UUID) -> List[User]:
        with self._pool.connection() as conn:
            rows = conn.execute(
                f"SELECT {_COLUMNS} FROM auth.users WHERE tenant_id = %s ORDER BY created_at",
                (tenant_id,),
            ).fetchall()
        return [self._to_entity(row) for row in rows]

    def count_app_admins(self) -> int:
        with self._pool.connection() as conn:
            row = conn.execute("SELECT count(*) FROM auth.users WHERE tenant_id IS NULL").fetchone()
        return row[0] if row else 0

    def save(self, user: User) -> None:
        with self._pool.connection() as conn:
            conn.execute(
                """
                INSERT INTO auth.users (id, tenant_id, username, email, password_hash, role, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    username = EXCLUDED.username,
                    email = EXCLUDED.email,
                    password_hash = EXCLUDED.password_hash,
                    role = EXCLUDED.role
                """,
                (
                    user.id,
                    user.tenant_id,
                    user.username,
                    user.email,
                    user.password_hash,
                    user.role.value,
                    user.created_at,
                ),
            )

    def delete(self, user_id: UUID) -> None:
        with self._pool.connection() as conn:
            conn.execute("DELETE FROM auth.users WHERE id = %s", (user_id,))

    @staticmethod
    def _to_entity(row) -> User:
        return User(
            id=row[0],
            tenant_id=row[1],
            username=row[2],
            email=row[3],
            password_hash=row[4],
            role=Role(row[5]),
            created_at=row[6],
        )
