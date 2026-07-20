import asyncio
import os
import re
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient


def _load_env_file() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


_load_env_file()
MONGODB_URI = _required_env("MONGODB_URI")
DB_NAME = _required_env("DB_NAME")


def get_org_license_prefix(name: str) -> str:
    words = [part for part in str(name or "").strip().split() if part]
    if not words:
        return "OR"
    if len(words) == 1:
        cleaned = re.sub(r"[^A-Za-z0-9]", "", words[0]).upper()
        if not cleaned:
            return "OR"
        return (cleaned[:2]).ljust(2, "X")
    first = words[0][0].upper() if words[0] else "O"
    second = words[1][0].upper() if words[1] else "R"
    return f"{first}{second}"


def ensure_license_codes(org_name: str, license_history: list) -> tuple[list, bool]:
    if not license_history:
        return license_history, False

    prefix = get_org_license_prefix(org_name)
    updated = []
    changed = False
    seen_codes = set()
    sequence = 1

    for item in license_history:
        license_item = dict(item)
        existing_code = str(license_item.get("licenseCode") or "").strip().upper()
        if existing_code and existing_code not in seen_codes:
            final_code = existing_code
        else:
            while True:
                candidate = f"{prefix}{sequence:02d}"
                sequence += 1
                if candidate not in seen_codes:
                    final_code = candidate
                    break
            changed = True

        if license_item.get("licenseCode") != final_code:
            license_item["licenseCode"] = final_code
            changed = True

        seen_codes.add(final_code)
        updated.append(license_item)

    return updated, changed


async def run() -> None:
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]

    updated_orgs = 0
    updated_licenses = 0

    async for org in db.organizations.find({}, {"name": 1, "licenseHistory": 1}):
        updated_history, changed = ensure_license_codes(org.get("name", ""), org.get("licenseHistory", []))
        if not changed:
            continue
        await db.organizations.update_one(
            {"_id": org["_id"]},
            {"$set": {"licenseHistory": updated_history}},
        )
        updated_orgs += 1
        updated_licenses += len(updated_history)

    print(f"Updated organizations: {updated_orgs}")
    print(f"Licenses touched: {updated_licenses}")
    client.close()


if __name__ == "__main__":
    asyncio.run(run())
