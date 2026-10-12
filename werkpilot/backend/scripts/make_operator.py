"""Macht einen registrierten Nutzer zum Betreiber (Zugang zur Betreiberansicht /admin).
Aufruf: python scripts/make_operator.py chef@firma.de [--revoke]"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.models.core import User


async def main(email: str, revoke: bool) -> None:
    async with get_sessionmaker()() as db:
        user = (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
        if not user:
            print(f"Kein Nutzer mit {email}. Bitte zuerst über die Website registrieren.")
            sys.exit(1)
        user.is_operator = not revoke
        await db.commit()
        print(f"{email}: is_operator = {user.is_operator}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    asyncio.run(main(sys.argv[1], "--revoke" in sys.argv))
