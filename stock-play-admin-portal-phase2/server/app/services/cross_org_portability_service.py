from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from pymongo.errors import DuplicateKeyError


class PortabilityError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def canonicalize_email(email: str) -> str:
    return email.strip().lower()


def _now():
    return datetime.now(timezone.utc)


def _serialize(doc):
    if not doc:
        return None
    doc["id"] = str(doc.get("_id"))
    doc.pop("_id", None)
    return doc


def to_object_id(value: str, field_name: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise PortabilityError("INVALID_ID", f"Invalid {field_name}") from exc


async def add_user_by_email(db, *, organization_id: str, email: str, actor_id: Optional[str] = None):
    # organization_id is validated for existence to catch bad UI input early.
    org_oid = to_object_id(organization_id, "organization_id")
    org = await db.organizations.find_one({"_id": org_oid}, projection={"_id": 1})
    if not org:
        raise PortabilityError("ORG_NOT_FOUND", "Organization not found")

    now = _now()
    email_canonical = canonicalize_email(email)

    existing = await db.users.find_one({"email_canonical": email_canonical})
    if existing:
        return {"created": False, "user": _serialize(existing)}

    payload = {
        "email": email,
        "email_canonical": email_canonical,
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "created_by": actor_id,
    }

    try:
        result = await db.users.insert_one(payload)
        created_user = await db.users.find_one({"_id": result.inserted_id})
        return {"created": True, "user": _serialize(created_user)}
    except DuplicateKeyError:
        # Concurrent create request: unique index protects correctness.
        existing = await db.users.find_one({"email_canonical": email_canonical})
        return {"created": False, "user": _serialize(existing)}


async def assign_license(
    db,
    *,
    organization_id: str,
    license_id: str,
    user_id: str,
    actor_id: Optional[str] = None,
):
    org_oid = to_object_id(organization_id, "organization_id")
    license_oid = to_object_id(license_id, "license_id")
    user_oid = to_object_id(user_id, "user_id")
    now = _now()

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            user_doc = await db.users.find_one({"_id": user_oid}, session=session)
            if not user_doc:
                raise PortabilityError("USER_NOT_FOUND", "User not found")

            license_doc = await db.licenses.find_one(
                {"_id": license_oid, "organization_id": org_oid},
                session=session,
            )
            if not license_doc:
                raise PortabilityError("LICENSE_NOT_FOUND", "License not found for organization")

            if license_doc.get("status") != "active" or license_doc.get("expires_at") <= now:
                raise PortabilityError("LICENSE_INACTIVE_OR_EXPIRED", "License is inactive or expired")

            if license_doc.get("seats_used", 0) >= license_doc.get("seat_limit", 0):
                raise PortabilityError("SEAT_LIMIT_EXCEEDED", "No seats available on this license")

            existing = await db.license_assignments.find_one(
                {"user_id": user_oid, "organization_id": org_oid, "status": "active"},
                session=session,
            )
            if existing:
                raise PortabilityError("ACTIVE_ASSIGNMENT_EXISTS", "User already has an active assignment in this organization")

            await db.license_assignments.insert_one(
                {
                    "user_id": user_oid,
                    "organization_id": org_oid,
                    "license_id": license_oid,
                    "status": "active",
                    "assigned_at": now,
                    "ended_at": None,
                    "source": "admin_ui",
                    "created_by": actor_id,
                    "created_at": now,
                    "updated_at": now,
                },
                session=session,
            )

            updated = await db.licenses.update_one(
                {
                    "_id": license_oid,
                    "seats_used": {"$lt": license_doc.get("seat_limit", 0)},
                },
                {"$inc": {"seats_used": 1, "version": 1}, "$set": {"updated_at": now}},
                session=session,
            )
            if updated.modified_count != 1:
                raise PortabilityError("SEAT_RACE_CONDITION", "Seat allocation race; retry")

    return {"status": "ok"}


async def reassign_license(
    db,
    *,
    organization_id: str,
    user_id: str,
    new_license_id: str,
    actor_id: Optional[str] = None,
):
    org_oid = to_object_id(organization_id, "organization_id")
    user_oid = to_object_id(user_id, "user_id")
    new_license_oid = to_object_id(new_license_id, "new_license_id")
    now = _now()

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            active_assignment = await db.license_assignments.find_one(
                {"user_id": user_oid, "organization_id": org_oid, "status": "active"},
                session=session,
            )
            if not active_assignment:
                raise PortabilityError("NO_ACTIVE_ASSIGNMENT", "No active assignment found for user in this organization")

            old_license_oid = active_assignment["license_id"]
            if old_license_oid == new_license_oid:
                raise PortabilityError("SAME_LICENSE", "User is already assigned to this license")

            new_license = await db.licenses.find_one(
                {"_id": new_license_oid, "organization_id": org_oid},
                session=session,
            )
            if not new_license:
                raise PortabilityError("LICENSE_NOT_FOUND", "New license not found for organization")

            if new_license.get("status") != "active" or new_license.get("expires_at") <= now:
                raise PortabilityError("LICENSE_INACTIVE_OR_EXPIRED", "New license is inactive or expired")

            if new_license.get("seats_used", 0) >= new_license.get("seat_limit", 0):
                raise PortabilityError("SEAT_LIMIT_EXCEEDED", "No seats available on new license")

            await db.license_assignments.update_one(
                {"_id": active_assignment["_id"]},
                {"$set": {"status": "ended", "ended_at": now, "updated_at": now, "ended_by": actor_id}},
                session=session,
            )

            await db.license_assignments.insert_one(
                {
                    "user_id": user_oid,
                    "organization_id": org_oid,
                    "license_id": new_license_oid,
                    "status": "active",
                    "assigned_at": now,
                    "ended_at": None,
                    "source": "reassignment",
                    "created_by": actor_id,
                    "created_at": now,
                    "updated_at": now,
                },
                session=session,
            )

            await db.licenses.update_one(
                {"_id": old_license_oid, "seats_used": {"$gt": 0}},
                {"$inc": {"seats_used": -1, "version": 1}, "$set": {"updated_at": now}},
                session=session,
            )

            inc_new = await db.licenses.update_one(
                {"_id": new_license_oid, "seats_used": {"$lt": new_license.get("seat_limit", 0)}},
                {"$inc": {"seats_used": 1, "version": 1}, "$set": {"updated_at": now}},
                session=session,
            )
            if inc_new.modified_count != 1:
                raise PortabilityError("SEAT_RACE_CONDITION", "Seat allocation race; retry")

    return {"status": "ok"}


async def expire_licenses(db, *, batch_size: int = 500):
    now = _now()
    expired = await db.licenses.find(
        {"status": "active", "expires_at": {"$lte": now}},
        projection={"_id": 1},
    ).to_list(length=batch_size)

    if not expired:
        return {"expired_licenses": 0, "assignments_ended": 0}

    license_ids = [x["_id"] for x in expired]

    await db.licenses.update_many(
        {"_id": {"$in": license_ids}},
        {"$set": {"status": "expired", "seats_used": 0, "updated_at": now}, "$inc": {"version": 1}},
    )
    result = await db.license_assignments.update_many(
        {"license_id": {"$in": license_ids}, "status": "active"},
        {"$set": {"status": "expired", "ended_at": now, "updated_at": now, "source": "expiry_job"}},
    )

    return {"expired_licenses": len(license_ids), "assignments_ended": result.modified_count}


async def list_organizations_for_portability(db):
    docs = await db.organizations.find(
        {},
        projection={"name": 1, "status": 1, "created_at": 1},
    ).to_list(length=1000)
    return [_serialize(x) for x in docs]


async def list_licenses_for_organization(db, *, organization_id: str):
    org_oid = to_object_id(organization_id, "organization_id")
    docs = await db.licenses.find(
        {"organization_id": org_oid},
        projection={
            "organization_id": 1,
            "plan_code": 1,
            "seat_limit": 1,
            "seats_used": 1,
            "expires_at": 1,
            "status": 1,
            "version": 1,
            "created_at": 1,
            "updated_at": 1,
        },
    ).to_list(length=1000)
    return [_serialize(x) for x in docs]


async def get_user_by_email(db, *, email: str):
    doc = await db.users.find_one({"email_canonical": canonicalize_email(email)})
    if not doc:
        raise PortabilityError("USER_NOT_FOUND", "User not found")
    return _serialize(doc)


async def get_active_assignment(db, *, organization_id: str, user_id: str):
    org_oid = to_object_id(organization_id, "organization_id")
    user_oid = to_object_id(user_id, "user_id")
    assignment = await db.license_assignments.find_one(
        {"organization_id": org_oid, "user_id": user_oid, "status": "active"},
        projection={"license_id": 1, "assigned_at": 1, "status": 1},
    )
    return _serialize(assignment)
