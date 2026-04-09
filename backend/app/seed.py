import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AdminUser
from app.security import hash_password

logger = logging.getLogger(__name__)


async def ensure_default_admin(session: AsyncSession) -> None:
    settings = get_settings()
    r = await session.execute(select(AdminUser).where(AdminUser.username == settings.admin_default_username))
    if r.scalar_one_or_none() is not None:
        return
    now = datetime.now()
    admin = AdminUser(
        username=settings.admin_default_username,
        password_hash=hash_password(settings.admin_default_password),
        created_at=now,
        updated_at=now,
    )
    session.add(admin)
    await session.commit()
    logger.info("Seeded default admin user '%s' (bcrypt)", settings.admin_default_username)
