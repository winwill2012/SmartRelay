"""
Apply migrations/001_init.sql to MySQL, then upsert default admin (bcrypt).
Usage: from backend/:  python -m scripts.run_migrations
Env: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# backend/ is cwd when running as python -m scripts.run_migrations
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    try:
        import bcrypt
        import pymysql
    except ImportError:
        print("Install deps: pip install pymysql bcrypt", file=sys.stderr)
        return 1
    host = os.getenv("MYSQL_HOST", "127.0.0.1")
    port = int(os.getenv("MYSQL_PORT", "3306"))
    user = os.getenv("MYSQL_USER", "root")
    password = os.getenv("MYSQL_PASSWORD", "")
    database = os.getenv("MYSQL_DATABASE", "SmartRelay")

    sql_path = BACKEND_ROOT / "migrations" / "001_init.sql"
    if not sql_path.is_file():
        print(f"Missing {sql_path}", file=sys.stderr)
        return 1

    sql_text = sql_path.read_text(encoding="utf-8")

    try:
        conn = pymysql.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
    except Exception as e:
        print(f"ERROR: MySQL connection failed: {e}", file=sys.stderr)
        print(
            "If remote grants are insufficient, run migrations/001_init.sql manually "
            "and insert admin row with a bcrypt hash of your password.",
            file=sys.stderr,
        )
        local_copy = BACKEND_ROOT / "migrations" / "001_init_local_manual.sql"
        local_copy.write_text(sql_text, encoding="utf-8")
        print(f"Wrote {local_copy} for manual execution.", file=sys.stderr)
        return 2

    try:
        with conn.cursor() as cur:
            for stmt in _split_sql(sql_text):
                if stmt.strip():
                    cur.execute(stmt)
        conn.commit()

        plain = os.getenv("ADMIN_DEFAULT_PASSWORD", "admin123").encode("utf-8")
        admin_hash = bcrypt.hashpw(plain, bcrypt.gensalt()).decode("ascii")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM admins WHERE username = %s",
                ("admin",),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE admins SET password_hash = %s, updated_at = UTC_TIMESTAMP() WHERE username = %s",
                    (admin_hash, "admin"),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO admins (username, password_hash, created_at, updated_at)
                    VALUES (%s, %s, UTC_TIMESTAMP(), UTC_TIMESTAMP())
                    """,
                    ("admin", admin_hash),
                )
        conn.commit()
        print("Migration OK; default admin 'admin' password from ADMIN_DEFAULT_PASSWORD or admin123.")
        return 0
    except Exception as e:
        conn.rollback()
        print(f"ERROR: Migration failed: {e}", file=sys.stderr)
        return 3
    finally:
        conn.close()


def _split_sql(text: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("--"):
            continue
        buf.append(line)
        if line.rstrip().endswith(";"):
            parts.append("\n".join(buf))
            buf = []
    if buf:
        parts.append("\n".join(buf))
    return parts


if __name__ == "__main__":
    raise SystemExit(main())
