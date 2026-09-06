from typing import Optional
from uuid import UUID

from psycopg_pool import ConnectionPool

from app.domain.entities import Role, User
from app.domain.ports import UserRepository

_COLUMNS = "id, tenant_id, username, email, password_hash, role, created_at"


class PostgresUserRepository(UserRepository):
    def __init__(self, pool: ConnectionPool):
        self._pool = pool

    def get_by_username(self, tenant_id: UUID, username: str) -> Optional[User]:
        with self._pool.connection() as conn:
            row = conn.execute(
                f"SELECT {_COLUMNS} FROM auth.users WHERE tenant_id = %s AND username = %s",
                (tenant_id, username),
            ).fetchone()
        return self._to_entity(row) if row else None

    def get_by_id(self, user_id: UUID) -> Optional[User]:
        with self._pool.connection() as conn:
            row = conn.execute(
                f"SELECT {_COLUMNS} FROM auth.users WHERE id = %s",
                (user_id,),
            ).fetchone()
        return self._to_entity(row) if row else None

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
