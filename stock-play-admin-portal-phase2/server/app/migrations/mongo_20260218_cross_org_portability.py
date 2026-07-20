"""
MongoDB migration for cross-organization user portability.

Creates collections (if needed), applies JSON schema validators, and
creates indexes that enforce global user uniqueness and fast assignment lookups.
"""

import asyncio
from datetime import datetime, timezone

from pymongo import ASCENDING
from pymongo.errors import CollectionInvalid

from app.db import get_database


def _users_validator():
    return {
        "$jsonSchema": {
            "bsonType": "object",
            "required": ["email", "email_canonical", "status", "created_at", "updated_at"],
            "properties": {
                "email": {"bsonType": "string"},
                "email_canonical": {"bsonType": "string"},
                "name": {"bsonType": ["string", "null"]},
                "status": {"enum": ["active", "inactive", "disabled"]},
                "created_at": {"bsonType": "date"},
                "updated_at": {"bsonType": "date"},
            },
        }
    }


def _organizations_validator():
    return {
        "$jsonSchema": {
            "bsonType": "object",
            "required": ["name", "status", "created_at"],
            "properties": {
                "name": {"bsonType": "string"},
                "status": {"enum": ["active", "inactive"]},
                "created_at": {"bsonType": "date"},
            },
        }
    }


def _licenses_validator():
    return {
        "$jsonSchema": {
            "bsonType": "object",
            "required": [
                "organization_id",
                "plan_code",
                "seat_limit",
                "seats_used",
                "expires_at",
                "status",
                "created_at",
                "updated_at",
            ],
            "properties": {
                "organization_id": {"bsonType": "objectId"},
                "plan_code": {"bsonType": "string"},
                "seat_limit": {"bsonType": "int", "minimum": 0},
                "seats_used": {"bsonType": "int", "minimum": 0},
                "expires_at": {"bsonType": "date"},
                "status": {"enum": ["active", "inactive", "expired"]},
                "created_at": {"bsonType": "date"},
                "updated_at": {"bsonType": "date"},
                "version": {"bsonType": "int", "minimum": 0},
            },
        }
    }


def _license_assignments_validator():
    return {
        "$jsonSchema": {
            "bsonType": "object",
            "required": [
                "user_id",
                "organization_id",
                "license_id",
                "status",
                "assigned_at",
                "created_at",
                "updated_at",
            ],
            "properties": {
                "user_id": {"bsonType": "objectId"},
                "organization_id": {"bsonType": "objectId"},
                "license_id": {"bsonType": "objectId"},
                "status": {"enum": ["active", "ended", "revoked", "expired"]},
                "assigned_at": {"bsonType": "date"},
                "ended_at": {"bsonType": ["date", "null"]},
                "created_by": {"bsonType": ["string", "null"]},
                "source": {"bsonType": ["string", "null"]},
                "created_at": {"bsonType": "date"},
                "updated_at": {"bsonType": "date"},
            },
        }
    }


async def _create_or_update_collection(db, name: str, validator: dict) -> None:
    try:
        await db.create_collection(name, validator=validator, validationLevel="moderate")
    except CollectionInvalid:
        await db.command(
            {
                "collMod": name,
                "validator": validator,
                "validationLevel": "moderate",
            }
        )


async def run_migration() -> None:
    db = get_database()

    await _create_or_update_collection(db, "users", _users_validator())
    await _create_or_update_collection(db, "organizations", _organizations_validator())
    await _create_or_update_collection(db, "licenses", _licenses_validator())
    await _create_or_update_collection(db, "license_assignments", _license_assignments_validator())

    # Global uniqueness for user identity.
    await db.users.create_index([("email_canonical", ASCENDING)], unique=True, name="ux_users_email_canonical")

    # License lifecycle and org-filtered queries.
    await db.licenses.create_index(
        [("organization_id", ASCENDING), ("status", ASCENDING), ("expires_at", ASCENDING)],
        name="ix_licenses_org_status_expires",
    )
    await db.licenses.create_index(
        [("organization_id", ASCENDING), ("plan_code", ASCENDING)],
        name="ix_licenses_org_plan",
    )

    # Fast access checks and reporting.
    await db.license_assignments.create_index(
        [("user_id", ASCENDING), ("organization_id", ASCENDING), ("status", ASCENDING)],
        name="ix_assignments_user_org_status",
    )
    await db.license_assignments.create_index(
        [("organization_id", ASCENDING), ("license_id", ASCENDING), ("status", ASCENDING)],
        name="ix_assignments_org_license_status",
    )
    await db.license_assignments.create_index(
        [("license_id", ASCENDING), ("status", ASCENDING)],
        name="ix_assignments_license_status",
    )

    # Enforce ONE active assignment per user per organization.
    await db.license_assignments.create_index(
        [("user_id", ASCENDING), ("organization_id", ASCENDING)],
        unique=True,
        partialFilterExpression={"status": "active"},
        name="ux_assignments_active_user_org",
    )


async def seed_reference_data() -> None:
    """
    Optional seed for quick smoke tests.
    Does not overwrite existing documents.
    """
    db = get_database()
    now = datetime.now(timezone.utc)

    if await db.organizations.count_documents({"name": "Acme Corp"}) == 0:
        await db.organizations.insert_one({"name": "Acme Corp", "status": "active", "created_at": now})


if __name__ == "__main__":
    asyncio.run(run_migration())
    asyncio.run(seed_reference_data())
    print("Cross-organization portability migration completed.")
