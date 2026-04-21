"""记录后台管理员对 API 的变更类请求（POST/PUT/PATCH/DELETE），便于审计。

写入在后台异步执行，避免 await DB 拖住响应（MySQL 慢或锁时否则会导致整站接口挂起）。
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import get_settings
from app.db import AsyncSessionLocal
from app.models import AdminOperationLog
from app.security import try_decode_token

logger = logging.getLogger(__name__)


async def _persist_operation_log(admin_id: int, method: str, path: str, status_code: int | None) -> None:
    try:
        async with AsyncSessionLocal() as session:
            session.add(
                AdminOperationLog(
                    admin_user_id=admin_id,
                    method=method,
                    path=path,
                    status_code=status_code,
                    created_at=datetime.now(),
                )
            )
            await session.commit()
    except Exception:
        logger.exception("admin_operation_log insert failed")


class AdminOperationAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        settings = get_settings()
        path = request.url.path
        method = request.method
        if method not in ("POST", "PUT", "PATCH", "DELETE"):
            return response
        api = settings.api_prefix.rstrip("/")
        admin_prefix = f"{api}/admin/"
        if not path.startswith(admin_prefix):
            return response
        if path.rstrip("/").endswith("/auth/login"):
            return response
        auth = request.headers.get("authorization")
        if not auth or not auth.lower().startswith("bearer "):
            return response
        token = auth[7:].strip()
        payload = try_decode_token(token)
        if not payload or payload.get("typ") != "admin":
            return response
        try:
            aid = int(payload["sub"])
        except (KeyError, ValueError, TypeError):
            return response
        m = method[:8]
        p = path[:512]
        sc = response.status_code
        asyncio.get_running_loop().create_task(_persist_operation_log(aid, m, p, sc))
        return response
