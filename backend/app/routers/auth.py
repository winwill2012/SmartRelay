import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.errors import PARAM_ERROR
from app.models import User
from app.response import err, ok
from app.schemas import WechatAuthBody
from app.security import create_access_token

logger = logging.getLogger(__name__)
router = APIRouter()

# 微信开发者工具模拟器在部分版本下会返回固定假 code，无法换 session（errcode 40029）
_KNOWN_MOCK_LOGIN_CODES = frozenset(
    {
        "thecodetislalmocklong",
    }
)


@router.post("/auth/wechat")
async def auth_wechat(body: WechatAuthBody, session: AsyncSession = Depends(get_session)):
    settings = get_settings()
    code = body.code.strip()
    if not code:
        return err(PARAM_ERROR, "code 不能为空")

    if code in _KNOWN_MOCK_LOGIN_CODES:
        return err(
            PARAM_ERROR,
            "当前 wx.login 返回的是开发者工具模拟器的假 code，无法换 session。请使用「真机调试」或在工具中关闭相关 Mock，详见 miniprogram/README.md",
        )

    if settings.wechat_app_id and settings.wechat_secret:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.weixin.qq.com/sns/jscode2session",
                params={
                    "appid": settings.wechat_app_id,
                    "secret": settings.wechat_secret,
                    "js_code": code,
                    "grant_type": "authorization_code",
                },
            )
            data = resp.json()
        if data.get("errcode"):
            logger.warning(
                "WeChat jscode2session failed: appid_prefix=%s code_len=%s errcode=%s errmsg=%s",
                settings.wechat_app_id[:8],
                len(code),
                data.get("errcode"),
                data.get("errmsg"),
            )
            return err(PARAM_ERROR, data.get("errmsg", "微信接口错误"))
        openid = data.get("openid")
        if not openid:
            return err(PARAM_ERROR, "未获取 openid")
    else:
        openid = f"dev_{code[:48]}" if len(code) > 8 else f"dev_{code}"

    r = await session.execute(select(User).where(User.openid == openid))
    user = r.scalar_one_or_none()
    now = datetime.now()
    if user is None:
        user = User(openid=openid, created_at=now, last_login_at=now)
        session.add(user)
        await session.commit()
        await session.refresh(user)
    else:
        user.last_login_at = now
        await session.commit()

    token = create_access_token(str(user.id), token_type="wx_user")
    return ok(
        {
            "access_token": token,
            "expires_in": settings.jwt_expire_minutes * 60,
            "user": {
                "id": user.id,
                "openid": user.openid,
                "nickname": user.nickname,
                "avatar_url": user.avatar_url,
            },
        }
    )
