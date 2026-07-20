"""
Service-layer pseudocode for cross-organization user portability.

This file is intentionally non-runnable pseudocode that mirrors
FastAPI + Motor patterns used in this backend.
"""

from datetime import datetime, timezone


def canonicalize_email(email: str) -> str:
    # Normalize for global uniqueness checks.
    return email.strip().lower()


async def add_user_by_email(db, *, org_id, email: str, actor_id: str):
    """
    1) Normalize email.
    2) Find global user by email_canonical.
    3) If missing, create global user.
    4) Return user and whether it was created now.
    """
    now = datetime.now(timezone.utc)
    email_canonical = canonicalize_email(email)

    user = await db.users.find_one({"email_canonical": email_canonical})
    if user:
        return {"user": user, "created": False}

    # Use insert with unique index protection on email_canonical.
    # If duplicate-key race occurs, re-read and return existing user.
    try:
        insert_result = await db.users.insert_one(
            {
                "email": email,
                "email_canonical": email_canonical,
                "status": "active",
                "created_at": now,
                "updated_at": now,
                "created_by": actor_id,
            }
        )
        user = await db.users.find_one({"_id": insert_result.inserted_id})
        return {"user": user, "created": True}
    except Exception as exc:
        # Pseudocode: if duplicate key on email_canonical, fetch existing.
        if "E11000" in str(exc):
            user = await db.users.find_one({"email_canonical": email_canonical})
            return {"user": user, "created": False}
        raise


async def assign_license(db, *, org_id, license_id, user_id, actor_id: str):
    """
    Assign active license to a user in an organization.
    Enforces:
    - license belongs to org
    - license active and not expired
    - seat limit not exceeded
    - only one active assignment per user/org
    """
    now = datetime.now(timezone.utc)

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            license_doc = await db.licenses.find_one(
                {"_id": license_id, "organization_id": org_id},
                session=session,
            )
            if not license_doc:
                raise ValueError("LICENSE_NOT_FOUND_FOR_ORG")

            if license_doc["status"] != "active" or license_doc["expires_at"] <= now:
                raise ValueError("LICENSE_INACTIVE_OR_EXPIRED")

            if license_doc["seats_used"] >= license_doc["seat_limit"]:
                raise ValueError("SEAT_LIMIT_EXCEEDED")

            existing = await db.license_assignments.find_one(
                {"user_id": user_id, "organization_id": org_id, "status": "active"},
                session=session,
            )
            if existing:
                raise ValueError("USER_ALREADY_HAS_ACTIVE_ASSIGNMENT_IN_ORG")

            await db.license_assignments.insert_one(
                {
                    "user_id": user_id,
                    "organization_id": org_id,
                    "license_id": license_id,
                    "status": "active",
                    "assigned_at": now,
                    "ended_at": None,
                    "created_by": actor_id,
                    "source": "admin_portal",
                    "created_at": now,
                    "updated_at": now,
                },
                session=session,
            )

            # Optional optimistic lock with version filter.
            update_result = await db.licenses.update_one(
                {
                    "_id": license_id,
                    "seats_used": {"$lt": license_doc["seat_limit"]},
                },
                {
                    "$inc": {"seats_used": 1, "version": 1},
                    "$set": {"updated_at": now},
                },
                session=session,
            )
            if update_result.modified_count != 1:
                raise ValueError("SEAT_RACE_CONDITION")


async def reassign_license(db, *, org_id, user_id, new_license_id, actor_id: str):
    """
    End current active assignment and create a new one.
    User data is unaffected because progress/history are keyed by user_id.
    """
    now = datetime.now(timezone.utc)

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            current_assignment = await db.license_assignments.find_one(
                {"user_id": user_id, "organization_id": org_id, "status": "active"},
                session=session,
            )
            if not current_assignment:
                raise ValueError("NO_ACTIVE_ASSIGNMENT_FOUND")

            old_license_id = current_assignment["license_id"]
            if old_license_id == new_license_id:
                raise ValueError("ALREADY_ASSIGNED_TO_TARGET_LICENSE")

            new_license = await db.licenses.find_one(
                {"_id": new_license_id, "organization_id": org_id},
                session=session,
            )
            if not new_license:
                raise ValueError("NEW_LICENSE_NOT_FOUND_FOR_ORG")
            if new_license["status"] != "active" or new_license["expires_at"] <= now:
                raise ValueError("NEW_LICENSE_INACTIVE_OR_EXPIRED")
            if new_license["seats_used"] >= new_license["seat_limit"]:
                raise ValueError("SEAT_LIMIT_EXCEEDED")

            await db.license_assignments.update_one(
                {"_id": current_assignment["_id"]},
                {
                    "$set": {
                        "status": "ended",
                        "ended_at": now,
                        "updated_at": now,
                        "ended_by": actor_id,
                    }
                },
                session=session,
            )

            await db.license_assignments.insert_one(
                {
                    "user_id": user_id,
                    "organization_id": org_id,
                    "license_id": new_license_id,
                    "status": "active",
                    "assigned_at": now,
                    "ended_at": None,
                    "created_by": actor_id,
                    "source": "reassignment",
                    "created_at": now,
                    "updated_at": now,
                },
                session=session,
            )

            await db.licenses.update_one(
                {"_id": old_license_id, "seats_used": {"$gt": 0}},
                {"$inc": {"seats_used": -1, "version": 1}, "$set": {"updated_at": now}},
                session=session,
            )
            await db.licenses.update_one(
                {"_id": new_license_id, "seats_used": {"$lt": new_license["seat_limit"]}},
                {"$inc": {"seats_used": 1, "version": 1}, "$set": {"updated_at": now}},
                session=session,
            )


async def expire_and_deactivate_licenses(db, *, batch_size: int = 500):
    """
    Scheduled job:
    - mark expired licenses as status=expired
    - end active assignments under those licenses
    - reset seats_used to 0 for expired licenses
    """
    now = datetime.now(timezone.utc)

    expired_licenses = await db.licenses.find(
        {"status": "active", "expires_at": {"$lte": now}},
        projection={"_id": 1},
    ).to_list(length=batch_size)

    if not expired_licenses:
        return {"expired_licenses": 0, "assignments_ended": 0}

    license_ids = [doc["_id"] for doc in expired_licenses]

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            await db.licenses.update_many(
                {"_id": {"$in": license_ids}},
                {
                    "$set": {"status": "expired", "seats_used": 0, "updated_at": now},
                    "$inc": {"version": 1},
                },
                session=session,
            )

            result = await db.license_assignments.update_many(
                {"license_id": {"$in": license_ids}, "status": "active"},
                {
                    "$set": {
                        "status": "expired",
                        "ended_at": now,
                        "updated_at": now,
                        "source": "expiry_job",
                    }
                },
                session=session,
            )

    return {"expired_licenses": len(license_ids), "assignments_ended": result.modified_count}
