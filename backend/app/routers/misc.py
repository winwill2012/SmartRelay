from fastapi import APIRouter, Depends

from app.deps import get_current_user_id
from app.response import ok

router = APIRouter()


@router.get("/notifications")
async def notifications(_user_id: int = Depends(get_current_user_id)):
    return ok({"items": []})


@router.get("/shares")
async def shares(_user_id: int = Depends(get_current_user_id)):
    return ok({"items": []})
