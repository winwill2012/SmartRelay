"""记录后台管理员对 API 的变更类请求（POST/PUT/PATCH/DELETE），便于审计。"""
from __future__ import annotations

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
        try:
            async with AsyncSessionLocal() as session:
                row = AdminOperationLog(
                    admin_user_id=aid,
                    method=method[:8],
                    path=path[:512],
                    status_code=response.status_code,
                    created_at=datetime.now(),
                )
                session.add(row)
                await session.commit()
        except Exception:
            logger.exception("admin_operation_log insert failed")
        return response
