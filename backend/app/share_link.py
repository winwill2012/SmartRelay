"""微信分享链接用无库表占位的签名令牌：生成邀请时不写 device_share_tokens，仅在对方接受时落库。"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from typing import Any

_PAYLOAD_VER = 1


def build_stateless_share_token(
    *, device_pk: int, owner_user_id: int, exp_unix: int, secret: str
) -> str:
    nonce = secrets.randbits(48)
    payload = {
        "v": _PAYLOAD_VER,
        "d": int(device_pk),
        "o": int(owner_user_id),
        "e": int(exp_unix),
        "n": int(nonce),
    }
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b = base64.urlsafe_b64encode(body).decode("ascii").rstrip("=")
    sig = hmac.new(secret.encode("utf-8"), b.encode("ascii"), hashlib.sha256).digest()
    s_sig = base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")
    return f"v1.{b}.{s_sig}"


def _b64_pad(s: str) -> str:
    return s + "=" * ((4 - len(s) % 4) % 4)


def verify_stateless_share_token(token: str, secret: str) -> dict[str, Any] | None:
    if not token.startswith("v1."):
        return None
    parts = token.split(".", 2)
    if len(parts) != 3:
        return None
    _, b, s_sig = parts
    try:
        sig_chk = base64.urlsafe_b64decode(_b64_pad(s_sig))
        expect = hmac.new(secret.encode("utf-8"), b.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(sig_chk, expect):
            return None
        raw = base64.urlsafe_b64decode(_b64_pad(b))
        p = json.loads(raw.decode("utf-8"))
        if p.get("v") != _PAYLOAD_VER:
            return None
        return p
    except Exception:
        return None


def stateless_token_storage_key(stateless_token: str) -> str:
    """与 device_share_tokens.share_token(128) 兼容的定长键，用于接受后落库与去重。"""
    return hashlib.sha256(stateless_token.encode("utf-8")).hexdigest()
