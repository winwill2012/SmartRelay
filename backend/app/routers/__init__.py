from fastapi import APIRouter

from app.routers import admin, auth, claim, devices, misc, schedules, user

api_router = APIRouter()
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(user.router, tags=["user"])
api_router.include_router(devices.router, tags=["devices"])
api_router.include_router(schedules.router, tags=["schedules"])
api_router.include_router(misc.router, tags=["misc"])
api_router.include_router(claim.router, tags=["claim"])
api_router.include_router(admin.router, tags=["admin"])
