"""
微信文本内容安全（msg_sec_check 2.0），用于昵称等资料类文本。
文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck.html
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_access_token: Optional[str] = None
_access_token_deadline: float = 0.0


async def _get_miniprogram_access_token() -> Optional[str]:
    """client_credential，带简单内存缓存。"""
    global _access_token, _access_token_deadline
    settings = get_settings()
    if not (settings.wechat_app_id and settings.wechat_secret):
        return None
    now = time.time()
    if _access_token and now < _access_token_deadline - 120:
        return _access_token
    async with httpx.AsyncClient(timeout=12.0) as client:
        r = await client.get(
            "https://api.weixin.qq.com/cgi-bin/token",
            params={
                "grant_type": "client_credential",
                "appid": settings.wechat_app_id,
                "secret": settings.wechat_secret,
            },
        )
    data = r.json()
    if data.get("errcode"):
        logger.warning("wechat cgi-bin/token errcode=%s errmsg=%s", data.get("errcode"), data.get("errmsg"))
        return None
    tok = data.get("access_token")
    if not tok:
        return None
    expires_in = int(data.get("expires_in", 7200))
    _access_token = tok
    _access_token_deadline = now + expires_in
    return tok


async def check_profile_text_safe(openid: str, content: str) -> Optional[str]:
    """
    调用 msg_sec_check：scene=1（资料），version=2。

    :return: None 表示通过；非 None 为可直接展示给用户的中文错误说明。
    未配置微信 AppId/Secret 时跳过校验（便于本地开发）。
    """
    text = (content or "").strip()
    if not text:
        return None

    # 本地/无微信登录时的占位 openid，无法调用微信安全接口
    if not openid or openid.startswith("dev_"):
        return None

    settings = get_settings()
    if not (settings.wechat_app_id and settings.wechat_secret):
        logger.debug("msg_sec_check skipped: wechat_app_id/secret not set")
        return None

    token = await _get_miniprogram_access_token()
    if not token:
        return "内容安全校验服务暂不可用，请稍后重试"

    payload = {
        "content": text[:2500],
        "version": 2,
        "scene": 1,
        "openid": openid,
        "nickname": text[:2500],
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"https://api.weixin.qq.com/wxa/msg_sec_check?access_token={token}",
            json=payload,
        )
    try:
        data = r.json()
    except Exception:
        logger.warning("msg_sec_check invalid JSON http_status=%s", r.status_code)
        return "内容安全校验失败，请稍后重试"

    errcode = int(data.get("errcode", 0) or 0)
    if errcode != 0:
        if errcode == 61010:
            return "昵称审核需您近期打开过本小程序，请先使用小程序后再试"
        if errcode == -1:
            return "微信服务繁忙，请稍后重试"
        logger.warning(
            "msg_sec_check err errcode=%s errmsg=%s trace_id=%s",
            errcode,
            data.get("errmsg"),
            data.get("trace_id"),
        )
        return "昵称校验未通过，请修改后重试"

    result = data.get("result") or {}
    suggest = str(result.get("suggest") or "pass").lower()
    if suggest == "pass":
        return None
    if suggest in ("risky", "review"):
        return "昵称存在违规内容，请修改后重试"
    return None
