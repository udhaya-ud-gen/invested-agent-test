import argparse
import asyncio

from .db import get_database
from .password_utils import hash_password


ORGANIZATIONS = []

PORTAL_USERS = [
    {
        "name": "John Smith",
        "email": "john.smith@stockplay.com",
        "password": "john123",
        "role": "Super Admin",
        "createdDate": "2024-01-16",
        "status": "Active",
    },
    {
        "name": "Sarah Johnson",
        "email": "sarah.johnson@stockplay.com",
        "password": "sarah123",
        "role": "Sales Admin",
        "createdDate": "2024-01-18",
        "status": "Active",
    },
    {
        "name": "Michael Chen",
        "email": "michael.chen@stockplay.com",
        "password": "michael123",
        "role": "Super Admin",
        "createdDate": "2024-02-21",
        "status": "Active",
    },
    {
        "name": "Emily Davis",
        "email": "emily.davis@stockplay.com",
        "password": "emily123",
        "role": "Sales Admin",
        "createdDate": "2024-02-22",
        "status": "Active",
    },
    {
        "name": "Alex Turner",
        "email": "alex.turner@stockplay.com",
        "password": "alex123",
        "role": "Sales Admin",
        "createdDate": "2024-03-11",
        "status": "Active",
    },
    {
        "name": "Lisa Martinez",
        "email": "lisa.martinez@stockplay.com",
        "password": "lisa123",
        "role": "Super Admin",
        "createdDate": "2023-11-06",
        "status": "Inactive",
    },
    {
        "name": "Robert Williams",
        "email": "robert.williams@stockplay.com",
        "password": "robert123",
        "role": "Sales Admin",
        "createdDate": "2024-01-26",
        "status": "Active",
    },
    {
        "name": "Jennifer Brown",
        "email": "jennifer.brown@stockplay.com",
        "password": "jennifer123",
        "role": "Sales Admin",
        "createdDate": "2024-01-27",
        "status": "Active",
    },
    {
        "name": "David Kim",
        "email": "david.kim@stockplay.com",
        "password": "david123",
        "role": "Super Admin",
        "createdDate": "2024-02-16",
        "status": "Inactive",
    },
    {
        "name": "Amanda Taylor",
        "email": "amanda.taylor@stockplay.com",
        "password": "amanda123",
        "role": "Sales Admin",
        "createdDate": "2024-01-20",
        "status": "Active",
    },
]


async def seed_data(reset: bool = False):
    db = get_database()

    if reset:
        await db.organizations.delete_many({})
        await db.portal_users.delete_many({})

    users_to_insert = []
    for user in PORTAL_USERS:
        password = user.get("password", "")
        # Avoid double hashing if a hashed value is already provided.
        if isinstance(password, str) and (password.startswith("$2a$") or password.startswith("$2b$")):
            hashed_password = password
        else:
            hashed_password = hash_password(str(password))
        users_to_insert.append({**user, "password": hashed_password})

    inserted_orgs = 0
    inserted_users = 0

    if ORGANIZATIONS:
        for organization in ORGANIZATIONS:
            existing_org = await db.organizations.find_one({"name": organization["name"]})
            if existing_org:
                continue
            await db.organizations.insert_one(organization)
            inserted_orgs += 1

    if users_to_insert:
        for user in users_to_insert:
            existing_user = await db.portal_users.find_one({"email": user["email"]})
            if existing_user:
                continue
            await db.portal_users.insert_one(user)
            inserted_users += 1

    org_count = await db.organizations.count_documents({})
    user_count = await db.portal_users.count_documents({})
    mode = "reset" if reset else "safe-append"
    print(f"Seed mode: {mode}")
    print(f"Inserted organizations: {inserted_orgs}")
    print(f"Inserted users: {inserted_users}")
    print(f"Total organizations: {org_count}")
    print(f"Total users: {user_count}")


def main():
    parser = argparse.ArgumentParser(
        description="Seed organizations and portal users without deleting existing data by default."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing organizations and portal users before seeding.",
    )
    args = parser.parse_args()
    asyncio.run(seed_data(reset=args.reset))


if __name__ == "__main__":
    main()
