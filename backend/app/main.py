import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.db import AsyncSessionLocal
from app.db_migrations import ensure_devices_relay_on
from app.errors import INTERNAL
from app.mqtt_service import mqtt_ingest_loop, mqtt_publisher
from app.routers import api_router
from app.seed import ensure_default_admin

logging.basicConfig(level=logging.INFO)
# 避免 httpx 在 INFO 下打印完整 URL（含微信 AppSecret）
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)
    async with AsyncSessionLocal() as session:
        await ensure_devices_relay_on(session)
        await ensure_default_admin(session)

    stop = asyncio.Event()
    ingest_task = asyncio.create_task(mqtt_ingest_loop(stop))
    await mqtt_publisher.start()

    yield

    stop.set()
    ingest_task.cancel()
    try:
        await ingest_task
    except asyncio.CancelledError:
        pass
    await mqtt_publisher.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    # 与 allow_origins=["*"] 同时 allow_credentials=True 违反 CORS 规范，浏览器可能拦截，导致前端 Axios 报 Network Error
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_exc_handler(_request, exc: HTTPException):
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "code": exc.detail["code"],
                    "message": exc.detail.get("message", ""),
                    "data": exc.detail.get("data"),
                },
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": INTERNAL, "message": str(exc.detail), "data": None},
        )

    app.include_router(api_router, prefix=settings.api_prefix)

    static_root = os.path.join(settings.upload_dir)
    os.makedirs(static_root, exist_ok=True)
    app.mount("/static/firmware", StaticFiles(directory=static_root), name="firmware_static")

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
