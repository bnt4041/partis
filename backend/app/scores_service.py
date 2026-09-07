import uuid
from datetime import datetime, timezone
from typing import Optional

from .db import pool

_COLUMNS = "id, tenant_id, title, abc, created_by, created_by_username, created_at, updated_at"


class ScoreNotFound(Exception):
    pass


def _row_to_dict(row) -> dict:
    return {
        "id": str(row[0]),
        "tenant_id": str(row[1]),
        "title": row[2],
        "abc": row[3],
        "created_by": str(row[4]) if row[4] else None,
        "created_by_username": row[5],
        "created_at": row[6].isoformat(),
        "updated_at": row[7].isoformat(),
    }


def save_score(
    tenant_id: str,
    title: str,
    abc: str,
    created_by: str,
    created_by_username: str,
    score_id: Optional[str] = None,
) -> dict:
    """Creates a new score, or - when score_id points at one that already
    belongs to this tenant - overwrites it in place. A score_id for another
    tenant (or one that doesn't exist) is treated as "create new" rather than
    silently failing or leaking whether it exists elsewhere."""
    now = datetime.now(timezone.utc)

    with pool.connection() as conn:
        existing = None
        if score_id:
            existing = conn.execute(
                "SELECT id FROM scores.scores WHERE id = %s AND tenant_id = %s", (score_id, tenant_id)
            ).fetchone()

        if existing:
            row = conn.execute(
                f"""
                UPDATE scores.scores SET title = %s, abc = %s, updated_at = %s
                WHERE id = %s
                RETURNING {_COLUMNS}
                """,
                (title, abc, now, score_id),
            ).fetchone()
        else:
            new_id = str(uuid.uuid4())
            row = conn.execute(
                f"""
                INSERT INTO scores.scores (id, tenant_id, title, abc, created_by, created_by_username, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING {_COLUMNS}
                """,
                (new_id, tenant_id, title, abc, created_by, created_by_username, now, now),
            ).fetchone()
    return _row_to_dict(row)


def list_scores(tenant_id: str) -> list[dict]:
    with pool.connection() as conn:
        rows = conn.execute(
            f"SELECT {_COLUMNS} FROM scores.scores WHERE tenant_id = %s ORDER BY updated_at DESC",
            (tenant_id,),
        ).fetchall()
    return [_row_to_dict(row) for row in rows]


def get_score(tenant_id: str, score_id: str) -> dict:
    with pool.connection() as conn:
        row = conn.execute(
            f"SELECT {_COLUMNS} FROM scores.scores WHERE id = %s AND tenant_id = %s", (score_id, tenant_id)
        ).fetchone()
    if row is None:
        raise ScoreNotFound(score_id)
    return _row_to_dict(row)


def delete_score(tenant_id: str, score_id: str) -> None:
    with pool.connection() as conn:
        result = conn.execute("DELETE FROM scores.scores WHERE id = %s AND tenant_id = %s", (score_id, tenant_id))
        if result.rowcount == 0:
            raise ScoreNotFound(score_id)
