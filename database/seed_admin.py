#!/usr/bin/env python3
"""
插入或修正默认管理员 admin / admin123（bcrypt，与 backend app.security 一致）。

用法（与 apply.py 相同的环境变量）：
  SR_MYSQL_PASS 必填
"""
from __future__ import annotations

import os
import sys

import bcrypt
import pymysql


def main() -> int:
    password = os.environ.get("SR_MYSQL_PASS") or os.environ.get("MYSQL_PASSWORD")
    if not password:
        print("Set SR_MYSQL_PASS or MYSQL_PASSWORD", file=sys.stderr)
        return 1

    host = os.environ.get("SR_MYSQL_HOST", "119.29.197.186")
    port = int(os.environ.get("SR_MYSQL_PORT", "3306"))
    user = os.environ.get("SR_MYSQL_USER", "SmartRelay")
    database = os.environ.get("SR_MYSQL_DB", "SmartRelay")

    plain = os.environ.get("SR_ADMIN_PASSWORD", "admin123")
    username = os.environ.get("SR_ADMIN_USERNAME", "admin")
    password_hash = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("ascii")

    conn = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM admin_users WHERE username=%s", (username,))
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE admin_users SET password_hash=%s, updated_at=NOW(3) WHERE username=%s",
                    (password_hash, username),
                )
                print(f"Updated admin password hash for '{username}'")
            else:
                cur.execute(
                    "INSERT INTO admin_users (username, password_hash, created_at, updated_at) "
                    "VALUES (%s, %s, NOW(3), NOW(3))",
                    (username, password_hash),
                )
                print(f"Inserted admin '{username}'")
        conn.commit()
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
