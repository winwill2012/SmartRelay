from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import SessionLocal
from app.deps import BizError
from app.errors import Err
from app.mqtt_bridge import MqttBridge
from app.responses import err, ok
from app.routers import admin as admin_router
from app.routers import mini as mini_router
from app import runtime as app_runtime
from app.scheduler_service import initial_reload, schedule_periodic_tasks
from app.uplink_worker import handle_uplink_message

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    q: asyncio.Queue[dict] = asyncio.Queue()
    bridge = MqttBridge(s)
    bridge.attach_loop(asyncio.get_running_loop(), q)
    app_runtime.mqtt_bridge = bridge
    bridge.start_background()

    async def uplink_consumer() -> None:
        while True:
            item = await q.get()
            try:
                async with SessionLocal() as db:
                    await handle_uplink_message(db, item)
            except Exception:
                logger.exception("uplink handle failed")

    task = asyncio.create_task(uplink_consumer())

    scheduler = AsyncIOScheduler()
    app.state.scheduler = scheduler
    schedule_periodic_tasks(scheduler)
    await initial_reload(scheduler)
    scheduler.start()

    yield

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    scheduler.shutdown(wait=False)
    bridge.stop()
    app_runtime.mqtt_bridge = None


app = FastAPI(title=get_settings().app_name, lifespan=lifespan)


@app.exception_handler(BizError)
async def biz_error_handler(_: Request, exc: BizError) -> JSONResponse:
    return JSONResponse(status_code=200, content=err(exc.code, exc.message))


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=200, content=err(Err.PARAM, "validation error"))


@app.get("/health")
async def health() -> dict:
    return ok({"status": "ok"})


app.include_router(mini_router.router)
app.include_router(admin_router.router)
