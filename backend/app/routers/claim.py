from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.errors import CONFLICT, PARAM_ERROR
from app.models import Device
from app.response import err, ok
from app.schemas import ClaimBody
from app.security import hash_password

router = APIRouter()


@router.post("/device/claim")
async def device_claim(body: ClaimBody, session: AsyncSession = Depends(get_session)):
    did = body.device_id.strip()
    if not did:
        return err(PARAM_ERROR, "device_id 无效")
    r = await session.execute(select(Device).where(Device.device_id == did))
    if r.scalar_one_or_none():
        return err(CONFLICT, "设备已存在，请使用绑定流程")

    dev = Device(
        device_id=did,
        device_secret_hash=hash_password(body.device_secret),
        mac=body.mac,
        fw_version=None,
        last_seen_at=None,
        created_at=datetime.now(),
    )
    session.add(dev)
    await session.commit()
    return ok({"device_id": dev.device_id, "registered": True})
