#!/usr/bin/env python3
"""
在远程 MySQL 上执行 SQL 文件（默认 init.sql）。

认证从环境变量读取（勿把密码写进代码或提交）：
  SR_MYSQL_HOST   默认 119.29.197.186
  SR_MYSQL_PORT   默认 3306
  SR_MYSQL_USER   默认 SmartRelay
  SR_MYSQL_DB     默认 SmartRelay
  SR_MYSQL_PASS   必填（PowerShell 请用 $env:SR_MYSQL_PASS='...' 避免 $ 被解析）

用法：
  python database/apply.py
  python database/apply.py database/migrations/001_add_foo.sql
"""
from __future__ import annotations

import os
import sys

import pymysql


def _strip_sql_comments(sql: str) -> str:
    out_lines: list[str] = []
    for line in sql.splitlines():
        s = line.strip()
        if s.startswith("--"):
            continue
        if "--" in line:
            line = line.split("--", 1)[0]
        out_lines.append(line)
    return "\n".join(out_lines)


def _split_statements(sql: str) -> list[str]:
    return [s.strip() for s in sql.split(";") if s.strip()]


def main() -> int:
    root = os.path.dirname(os.path.abspath(__file__))
    sql_path = os.path.join(root, "init.sql") if len(sys.argv) < 2 else os.path.abspath(sys.argv[1])
    if not os.path.isfile(sql_path):
        print("File not found:", sql_path, file=sys.stderr)
        return 1

    password = os.environ.get("SR_MYSQL_PASS") or os.environ.get("MYSQL_PASSWORD")
    if not password:
        print("Set SR_MYSQL_PASS (or MYSQL_PASSWORD) in the environment.", file=sys.stderr)
        return 1

    host = os.environ.get("SR_MYSQL_HOST", "119.29.197.186")
    port = int(os.environ.get("SR_MYSQL_PORT", "3306"))
    user = os.environ.get("SR_MYSQL_USER", "SmartRelay")
    database = os.environ.get("SR_MYSQL_DB", "SmartRelay")

    with open(sql_path, "r", encoding="utf-8") as f:
        raw = f.read()
    statements = _split_statements(_strip_sql_comments(raw))

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
            for i, stmt in enumerate(statements):
                cur.execute(stmt)
                preview = stmt.replace("\n", " ")[:100]
                print(f"OK [{i + 1}/{len(statements)}]: {preview}{'...' if len(stmt) > 100 else ''}")
        conn.commit()
        print("COMMIT OK")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
