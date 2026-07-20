from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId
from bson.errors import InvalidId
import re
import asyncio
import json
from urllib import request as urlrequest
from urllib import error as urlerror
from datetime import datetime, timedelta, timezone
import os
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from pymongo.errors import PyMongoError

from .db import get_database, get_auth_service_database
from .password_utils import hash_password, verify_password
from .schemas import (
    Organization,
    OrganizationIn,
    OrganizationUpdate,
    OrgAdminUserIn,
    OrgAdminUserUpdate,
    PortalUser,
    PortalUserIn,
    PortalUserUpdate,
    LoginRequest,
    PasswordResetRequest,
    RegisterAuthorizedUserRequest,
    Role,
    RoleUpdate,
)
from .portability_routes import router as portability_router

app = FastAPI(title="Stock Play Admin API")
app.include_router(portability_router)

DEFAULT_LEVEL_CONFIG = [
    {"level": "Beginner", "startingBalance": 50000, "gainTarget": 200000},
    {"level": "Intermediate", "startingBalance": 200000, "gainTarget": 500000},
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_ROLE_KEY = "super_admin"
DEFAULT_ROLE_DISPLAY_NAME = "Super Admin"
scheduler: Optional[AsyncIOScheduler] = None


@app.get("/")
async def root():
    return {
        "message": "Stock Play Admin API is running",
        "health": "/health",
        "docs": "/docs",
    }


def _to_role_key(role_name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", str(role_name or "").strip().lower())
    normalized = normalized.strip("_")
    return normalized or DEFAULT_ROLE_KEY


async def _ensure_default_roles(db):
    defaults = [
        {
            "key": "super_admin",
            "displayName": "Super Admin",
            "description": "Full administrative access",
            "isActive": True,
        },
        {
            "key": "sales_admin",
            "displayName": "Sales Admin",
            "description": "Sales-focused administrative access",
            "isActive": True,
        },
        {
            "key": "org_admin",
            "displayName": "Org Admin",
            "description": "Organization-level administrative access",
            "isActive": True,
        },
    ]
    for role in defaults:
        await db.roles.update_one(
            {"key": role["key"]},
            {"$setOnInsert": role},
            upsert=True,
        )


async def _get_role_display_map(db) -> dict[str, str]:
    await _ensure_default_roles(db)
    roles = await db.roles.find().to_list(length=500)
    return {
        str(role.get("key") or ""): str(role.get("displayName") or "")
        for role in roles
        if role.get("key")
    }


async def _run_expiry_job_on_startup():
    try:
        await run_expiry_status_job()
    except Exception as exc:
        print(f"Startup expiry job failed: {exc}")


def _enrich_user_role(document: dict, role_display_map: dict[str, str]) -> dict:
    role_key = str(document.get("roleKey") or "").strip()
    legacy_role = str(document.get("role") or "").strip()

    if not role_key and legacy_role:
        role_key = _to_role_key(legacy_role)

    display_name = role_display_map.get(role_key) if role_key else None
    if not display_name:
        display_name = legacy_role or DEFAULT_ROLE_DISPLAY_NAME

    document["roleKey"] = role_key or DEFAULT_ROLE_KEY
    document["roleDisplayName"] = display_name
    document["role"] = display_name
    return document


def _normalize_email(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _parse_expiry_value(value: Optional[str]):
    if not value:
        return None, None
    raw = str(value).strip()
    if not raw:
        return None, None

    # Support ISO timestamps with trailing Z.
    normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw

    # If a time component exists, preserve minute/second precision.
    if "T" in normalized or " " in normalized:
        try:
            parsed_dt = datetime.fromisoformat(normalized)
            if parsed_dt.tzinfo is None:
                parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
            else:
                parsed_dt = parsed_dt.astimezone(timezone.utc)
            return parsed_dt, "datetime"
        except ValueError:
            pass

    try:
        if len(raw) >= 10:
            return datetime.strptime(raw[:10], "%Y-%m-%d").date(), "date"
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(normalized).date(), "date"
    except ValueError:
        return None, None


def _is_expired_value(value: Optional[str], now_utc=None) -> bool:
    parsed, value_type = _parse_expiry_value(value)
    if not parsed:
        return False
    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    if value_type == "datetime":
        return parsed <= now_utc
    # Date-only expiry should expire on the specified calendar day.
    return parsed <= now_utc.date()


def _to_utc_iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_license_expiry_datetimes(
    license_history: list,
    *,
    existing_license_codes: Optional[set[str]] = None,
    default_anchor_utc: Optional[datetime] = None,
) -> tuple[list, bool]:
    if not license_history:
        return license_history, False

    if default_anchor_utc is None:
        default_anchor_utc = datetime.now(timezone.utc)

    normalized_items = []
    changed = False
    existing_codes_upper = {str(code).strip().upper() for code in (existing_license_codes or set()) if str(code).strip()}

    for item in license_history:
        license_item = dict(item)
        raw_expiry = license_item.get("expiryDate")
        parsed_expiry, expiry_type = _parse_expiry_value(raw_expiry)

        if parsed_expiry and expiry_type == "date":
            item_code = str(license_item.get("licenseCode") or "").strip().upper()
            is_existing = bool(item_code and item_code in existing_codes_upper)

            # Preserve legacy items on update; normalize only new licenses.
            if not is_existing:
                purchase_raw = license_item.get("purchaseDate")
                purchase_dt, purchase_type = _parse_expiry_value(purchase_raw)

                if purchase_dt and purchase_type == "datetime":
                    anchor_dt = purchase_dt
                else:
                    anchor_dt = default_anchor_utc

                # Date-only expiries should remain valid through the full day.
                # Store them at end-of-day UTC to avoid same-day premature expiry.
                normalized_expiry = datetime.combine(
                    parsed_expiry,
                    datetime.max.time().replace(microsecond=0),
                    tzinfo=timezone.utc,
                )
                normalized_expiry_str = _to_utc_iso_z(normalized_expiry)

                if str(raw_expiry or "").strip() != normalized_expiry_str:
                    license_item["expiryDate"] = normalized_expiry_str
                    changed = True

        normalized_items.append(license_item)

    return normalized_items, changed


def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send email via Resend API."""
    api_key = os.getenv("RESEND_API_KEY", "")
    from_email = os.getenv("RESEND_FROM", "") or os.getenv("FROM_EMAIL", "")

    if not api_key or not from_email or not to_email:
        print("Email send skipped: RESEND_API_KEY or FROM email missing.")
        return False

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }

    req = urlrequest.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "stock-play-admin-portal/1.0",
        },
        method="POST",
    )

    try:
        with urlrequest.urlopen(req, timeout=10) as response:
            return 200 <= response.status < 300
    except urlerror.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = "no response body"
        print(f"Resend API error: {exc.code} {body}")
        return False
    except Exception as exc:
        print(f"Resend send error: {type(exc).__name__}: {exc}")
        return False


def _send_expiry_notice_email(
    *,
    to_email: str,
    recipient_name: str,
    entity_type: str,
    entity_name: str,
    expiry_date: Optional[str],
) -> bool:
    subject = f"Access Expired - {entity_type}"
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #222;">
        <h3>Access Status Updated</h3>
        <p>Hello {recipient_name or "User"},</p>
        <p>Your {entity_type} access for <strong>{entity_name}</strong> is now marked as <strong>Expired</strong>.</p>
        <p>Expiry date: <strong>{expiry_date or "N/A"}</strong></p>
        <p>If this is unexpected, contact your administrator.</p>
      </body>
    </html>
    """
    return _send_email(to_email, subject, html_body)


async def run_expiry_status_job():
    db = get_database()
    now_utc = datetime.now(timezone.utc)

    summary = {
        "organizations_expired": 0,
        "license_history_expired": 0,
        "authorized_users_expired": 0,
        "emails_sent": 0,
    }

    organizations = await db.organizations.find().to_list(length=5000)
    for org in organizations:
        org_changed = False
        org_name = str(org.get("name") or "Organization")
        org_status = str(org.get("status") or "")

        if org_status != "Expired" and _is_expired_value(org.get("expiryDate"), now_utc):
            org["status"] = "Expired"
            org_changed = True
            summary["organizations_expired"] += 1

            for contact_type in ("primary", "secondary"):
                contact_email = (
                    org.get("contact", {})
                    .get(contact_type, {})
                    .get("email")
                )
                if contact_email and _send_expiry_notice_email(
                    to_email=contact_email,
                    recipient_name=org_name,
                    entity_type="organization",
                    entity_name=org_name,
                    expiry_date=org.get("expiryDate"),
                ):
                    summary["emails_sent"] += 1

        updated_licenses = []
        for license_item in org.get("licenseHistory", []):
            license_data = dict(license_item)
            license_status = str(license_data.get("status") or "")

            if license_status != "Expired" and _is_expired_value(license_data.get("expiryDate"), now_utc):
                license_data["status"] = "Expired"
                org_changed = True
                summary["license_history_expired"] += 1

            updated_licenses.append(license_data)

        expired_license_ids = set()
        expired_license_codes = set()
        for license_data in updated_licenses:
            if str(license_data.get("status") or "").strip().lower() != "expired":
                continue
            license_id = str(license_data.get("id") or "").strip()
            if license_id:
                expired_license_ids.add(license_id)
            license_code = str(license_data.get("licenseCode") or "").strip().upper()
            if license_code:
                expired_license_codes.add(license_code)

        updated_users = []
        for user in org.get("authorizedUsers", []):
            user_data = dict(user)
            user_status = str(user_data.get("status") or "")
            user_license_id = str(user_data.get("licenseId") or "").strip()
            user_license_code = str(user_data.get("licenseCode") or "").strip().upper()

            linked_to_expired_license = (
                (user_license_id and user_license_id in expired_license_ids) or
                (user_license_code and user_license_code in expired_license_codes)
            )

            if user_status != "Expired" and linked_to_expired_license:
                user_data["status"] = "Expired"
                org_changed = True
                summary["authorized_users_expired"] += 1

                if user_data.get("email") and _send_expiry_notice_email(
                    to_email=user_data["email"],
                    recipient_name=str(user_data.get("name") or "User"),
                    entity_type="authorized user",
                    entity_name=org_name,
                    expiry_date=user_data.get("expiryDate"),
                ):
                    summary["emails_sent"] += 1

            updated_users.append(user_data)

        if org_changed:
            await db.organizations.update_one(
                {"_id": org["_id"]},
                {"$set": {"status": org.get("status", "Pending"), "licenseHistory": updated_licenses, "authorizedUsers": updated_users}},
            )

    return summary


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/db-ping")
async def db_ping():
    db = get_database()
    await db.command("ping")
    return {"status": "ok"}


@app.post("/jobs/expire-access/run")
async def run_expire_access_job():
    summary = await run_expiry_status_job()
    return {"status": "ok", "summary": summary}


@app.on_event("startup")
async def startup_scheduler():
    global scheduler
    enabled = os.getenv("ENABLE_EXPIRY_CRON", "true").strip().lower() in {"1", "true", "yes", "on"}
    if not enabled:
        return

    if scheduler and scheduler.running:
        return

    scheduler = AsyncIOScheduler()
    interval_minutes = int(os.getenv("EXPIRY_CRON_INTERVAL_MINUTES", "2"))
    if interval_minutes > 0:
        scheduler.add_job(
            run_expiry_status_job,
            "interval",
            minutes=interval_minutes,
            id="expiry_status_job",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
    else:
        hour = int(os.getenv("EXPIRY_CRON_HOUR", "0"))
        minute = int(os.getenv("EXPIRY_CRON_MINUTE", "30"))
        timezone = os.getenv("EXPIRY_CRON_TIMEZONE", "UTC")
        scheduler.add_job(
            run_expiry_status_job,
            CronTrigger(hour=hour, minute=minute, timezone=timezone),
            id="expiry_status_job",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )

    scheduler.start()

    run_on_startup = os.getenv("RUN_EXPIRY_JOB_ON_STARTUP", "true").strip().lower() in {"1", "true", "yes", "on"}
    if run_on_startup:
        asyncio.create_task(_run_expiry_job_on_startup())


@app.on_event("shutdown")
async def shutdown_scheduler():
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
    scheduler = None


@app.post("/login", response_model=PortalUser)
async def login(payload: LoginRequest):
    db = get_database()
    normalized_login_email = _normalize_email(payload.email)

    try:
        portal_user = await db.portal_users.find_one(
            {"email": {"$regex": f"^{re.escape(normalized_login_email)}$", "$options": "i"}}
        )
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable. Please try again.",
        ) from exc

    if portal_user:
        stored_password = portal_user.get("password")
        user_status = str(portal_user.get("status") or "").strip().lower()

        if user_status and user_status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User access is disabled",
            )

        if _is_expired_value(portal_user.get("expiryDate")):
            await db.portal_users.update_one(
                {"_id": portal_user["_id"]},
                {"$set": {"status": "Expired"}},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User access has expired",
            )

        if not stored_password or not verify_password(payload.password, stored_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        try:
            role_display_map = await _get_role_display_map(db)
        except PyMongoError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database is unavailable. Please try again.",
            ) from exc
        return _enrich_user_role(_serialize_document(portal_user), role_display_map)

    # Not a portal_users account -- check each organization's embedded Org Admin Users.
    org = await db.organizations.find_one(
        {"orgAdminUsers.email": {"$regex": f"^{re.escape(normalized_login_email)}$", "$options": "i"}}
    )
    admin = None
    if org:
        admin = next(
            (a for a in org.get("orgAdminUsers", []) if _normalize_email(a.get("email")) == normalized_login_email),
            None,
        )

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    stored_password = admin.get("password")
    user_status = str(admin.get("status") or "").strip().lower()
    if user_status and user_status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User access is disabled",
        )

    if not stored_password or not verify_password(payload.password, stored_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return {
        "id": admin.get("id"),
        "name": admin.get("name"),
        "email": admin.get("email"),
        "roleKey": "org_admin",
        "roleDisplayName": "Org Admin",
        "role": "Org Admin",
        "createdDate": admin.get("createdDate"),
        "status": admin.get("status", "Active"),
        "organizationId": str(org["_id"]),
        "organizationName": org.get("name"),
    }


def _compute_active_licenses(license_history: list) -> int:
    """
    Dynamically calculate active licenses from license history.
    Sum of all licenses where status = "Active"
    """
    if not license_history:
        return 0
    total = sum(
        item.get("count", 0) for item in license_history
        if item.get("status") == "Active" and not _is_expired_value(item.get("expiryDate"))
    )
    return total


def _compute_authorized_users_count(authorized_users: list) -> int:
    """
    Calculate count of authorized users with Active status
    """
    if not authorized_users:
        return 0
    count = sum(
        1 for user in authorized_users
        if user.get("status") == "Active"
    )
    return count


def _prune_authorized_users_for_existing_licenses(
    authorized_users: list,
    license_history: list,
) -> tuple[list, bool]:
    if not authorized_users:
        return authorized_users, False

    existing_licenses = list(license_history or [])
    if not existing_licenses:
        changed = False
        preserved = []
        for user in authorized_users:
            user_data = dict(user)
            if str(user_data.get("status") or "").strip().lower() != "expired":
                user_data["status"] = "Expired"
                changed = True
            preserved.append(user_data)
        return preserved, changed

    existing_license_ids = {
        str(item.get("id") or "").strip()
        for item in existing_licenses
        if str(item.get("id") or "").strip()
    }
    existing_license_codes = {
        str(item.get("licenseCode") or "").strip().upper()
        for item in existing_licenses
        if str(item.get("licenseCode") or "").strip()
    }

    kept = []
    changed = False
    for user in authorized_users:
        user_data = dict(user)
        user_license_id = str(user_data.get("licenseId") or "").strip()
        user_license_code = str(user_data.get("licenseCode") or "").strip().upper()
        linked_to_existing = (
            (user_license_id and user_license_id in existing_license_ids) or
            (user_license_code and user_license_code in existing_license_codes)
        )

        # Preserve users; if their linked license no longer exists, mark them expired
        # instead of deleting the record.
        if not linked_to_existing and str(user_data.get("status") or "").strip().lower() != "expired":
            user_data["status"] = "Expired"
            changed = True

        kept.append(user_data)

    return kept, changed


def _get_org_license_prefix(name: str) -> str:
    words = [
        re.sub(r"[^A-Za-z0-9]", "", part).upper()
        for part in str(name or "").strip().split()
        if part
    ]
    words = [word for word in words if word]
    if not words:
        return "ORG"

    first_word = words[0]
    if len(first_word) == 4:
        return first_word[:4]
    if len(first_word) > 4:
        return first_word[:3]
    if len(first_word) >= 3:
        return first_word[:3]

    # For very short names, borrow initials from the following words.
    tail_initials = "".join(word[0] for word in words[1:] if word)
    candidate = f"{first_word}{tail_initials}".upper()
    return (candidate[:3] or "ORG").ljust(2, "X")


def _get_org_license_token(org_identifier, org_name: str) -> str:
    cleaned_identifier = re.sub(r"[^A-Za-z0-9]", "", str(org_identifier or "")).upper()
    if cleaned_identifier:
        return cleaned_identifier[-3:]

    # Fallback when id is unavailable (legacy paths): derive deterministic token from name.
    cleaned_name = re.sub(r"[^A-Za-z0-9]", "", str(org_name or "")).upper() or "ORG"
    return cleaned_name[-3:].rjust(3, "X")


def _build_org_license_base(org_name: str, org_identifier) -> str:
    return f"{_get_org_license_prefix(org_name)}{_get_org_license_token(org_identifier, org_name)}"


def _ensure_license_codes(org_name: str, org_identifier, license_history: list) -> tuple[list, bool]:
    if not license_history:
        return license_history, False

    prefix = _build_org_license_base(org_name, org_identifier)
    updated = []
    changed = False
    code_pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    seen_numbers = set()
    sequence = 1

    for item in license_history:
        license_item = dict(item)
        existing_code = str(license_item.get("licenseCode") or "").strip().upper()
        match = code_pattern.match(existing_code)
        if match:
            number = int(match.group(1))
            if number > 0 and number not in seen_numbers:
                final_number = number
            else:
                while sequence in seen_numbers:
                    sequence += 1
                final_number = sequence
                sequence += 1
                changed = True
        else:
            while sequence in seen_numbers:
                sequence += 1
            final_number = sequence
            sequence += 1
            changed = True

        final_code = f"{prefix}{final_number:02d}"

        if license_item.get("licenseCode") != final_code:
            license_item["licenseCode"] = final_code
            changed = True

        seen_numbers.add(final_number)
        updated.append(license_item)

    return updated, changed


def _serialize_document(document):
    if not document:
        return None
    document["id"] = str(document.get("_id"))
    document.pop("_id", None)
    document.pop("password", None)  # Remove password for security
    
    # Add dynamically computed fields for organizations
    if "licenseHistory" in document:
        document["activeLicenses"] = _compute_active_licenses(document.get("licenseHistory", []))
    
    if "authorizedUsers" in document:
        document["authorizedUsersCount"] = _compute_authorized_users_count(document.get("authorizedUsers", []))
    
    return document


def _to_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid id format",
        ) from exc


@app.get("/organizations", response_model=list[Organization])
async def list_organizations():
    db = get_database()
    documents = await db.organizations.find().to_list(length=1000)
    serialized = []
    for doc in documents:
        updated_history, changed = _ensure_license_codes(
            doc.get("name", ""),
            doc.get("_id"),
            doc.get("licenseHistory", [])
        )
        updated_users, users_changed = _prune_authorized_users_for_existing_licenses(
            doc.get("authorizedUsers", []),
            updated_history,
        )
        if changed:
            await db.organizations.update_one({"_id": doc["_id"]}, {"$set": {"licenseHistory": updated_history}})
            doc["licenseHistory"] = updated_history
        if users_changed:
            await db.organizations.update_one({"_id": doc["_id"]}, {"$set": {"authorizedUsers": updated_users}})
            doc["authorizedUsers"] = updated_users
        serialized.append(_serialize_document(doc))
    return serialized


@app.get("/organizations/{org_id}", response_model=Organization)
async def get_organization(org_id: str):
    db = get_database()
    document = await db.organizations.find_one({"_id": _to_object_id(org_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    updated_history, changed = _ensure_license_codes(
        document.get("name", ""),
        document.get("_id"),
        document.get("licenseHistory", [])
    )
    updated_users, users_changed = _prune_authorized_users_for_existing_licenses(
        document.get("authorizedUsers", []),
        updated_history,
    )
    if changed:
        await db.organizations.update_one({"_id": document["_id"]}, {"$set": {"licenseHistory": updated_history}})
        document["licenseHistory"] = updated_history
    if users_changed:
        await db.organizations.update_one({"_id": document["_id"]}, {"$set": {"authorizedUsers": updated_users}})
        document["authorizedUsers"] = updated_users
    return _serialize_document(document)


@app.post("/organizations", response_model=Organization, status_code=status.HTTP_201_CREATED)
async def create_organization(payload: OrganizationIn):
    db = get_database()
    data = payload.model_dump(by_alias=True, exclude_none=True)
    data["licenseHistory"], _ = _normalize_license_expiry_datetimes(
        data.get("licenseHistory", []),
    )
    data.setdefault("status", "Pending")
    data.setdefault("activeMobileUsers", 0)
    data.setdefault("address", {})
    data.setdefault("contact", {"primary": {}, "secondary": {}})
    data.setdefault("licenseHistory", [])
    data.setdefault("authorizedUsers", [])
    data["authorizedUsers"], _ = _prune_authorized_users_for_existing_licenses(
        data.get("authorizedUsers", []),
        data.get("licenseHistory", []),
    )
    # Insert first so license code generation can use the real unique org id.
    result = await db.organizations.insert_one(data)
    document = await db.organizations.find_one({"_id": result.inserted_id})
    updated_history, changed = _ensure_license_codes(
        document.get("name", ""),
        document.get("_id"),
        document.get("licenseHistory", [])
    )
    if changed:
        await db.organizations.update_one({"_id": document["_id"]}, {"$set": {"licenseHistory": updated_history}})
        document["licenseHistory"] = updated_history
    return _serialize_document(document)


_LEVEL_TO_PACKAGE = {"Beginner": "BEGINNER", "Intermediate": "INTERMEDIATE"}


async def _sync_auth_service_users_for_org(org: dict):
    """
    Push each authorized user's current Level/Level Configuration into the
    trading app's own auth_service.users collection (same MongoDB cluster,
    separate database) so the change is reflected there directly -- no
    dependency on the app itself calling back into this API.
    """
    auth_db = get_auth_service_database()
    level_configuration = org.get("levelConfiguration") or DEFAULT_LEVEL_CONFIG
    level_map = {entry.get("level"): entry for entry in level_configuration}

    for user in org.get("authorizedUsers", []):
        email = user.get("email")
        level = user.get("level") or "Beginner"
        package = _LEVEL_TO_PACKAGE.get(level)
        config = level_map.get(level)
        if not email or not package or not config:
            continue

        update_fields = {"package": package}
        starting_balance = config.get("startingBalance")
        if starting_balance is not None:
            update_fields["virtual_balance"] = starting_balance

        try:
            await auth_db.users.update_one(
                {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
                {"$set": update_fields},
            )
        except PyMongoError:
            continue


@app.put("/organizations/{org_id}", response_model=Organization)
async def update_organization(org_id: str, payload: OrganizationUpdate):
    """
    Update organization with strict license control validation.
    Active Licenses are computed dynamically from License History.
    Ensures Authorized Users never exceeds Active Licenses.
    """
    db = get_database()
    
    # Get current organization to validate license constraints
    current_org = await db.organizations.find_one({"_id": _to_object_id(org_id)})
    if not current_org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    
    update_data = payload.model_dump(by_alias=True, exclude_none=True)
    
    if update_data:
        # === STRICT LICENSE CONTROL VALIDATION ===

        org_name_for_codes = update_data.get("name", current_org.get("name", ""))
        if "licenseHistory" in update_data:
            existing_codes = {
                str(item.get("licenseCode") or "").strip().upper()
                for item in current_org.get("licenseHistory", [])
                if str(item.get("licenseCode") or "").strip()
            }
            update_data["licenseHistory"], _ = _normalize_license_expiry_datetimes(
                update_data["licenseHistory"],
                existing_license_codes=existing_codes,
            )
            update_data["licenseHistory"], _ = _ensure_license_codes(
                org_name_for_codes,
                current_org.get("_id"),
                update_data["licenseHistory"]
            )
            users_source = update_data.get("authorizedUsers", current_org.get("authorizedUsers", []))
            pruned_users, _ = _prune_authorized_users_for_existing_licenses(
                users_source,
                update_data["licenseHistory"],
            )
            update_data["authorizedUsers"] = pruned_users

        # Compute active licenses from licenseHistory
        # Use updated licenseHistory if provided, otherwise use current
        license_history = update_data.get("licenseHistory", current_org.get("licenseHistory", []))
        active_licenses = _compute_active_licenses(license_history)
        
        # Get Authorized Users count (use updated value if provided, otherwise current)
        authorized_users = update_data.get("authorizedUsers", current_org.get("authorizedUsers", []))
        authorized_users_count = _compute_authorized_users_count(authorized_users)
        
        # Validation: Authorized Users must not exceed Active Licenses
        if authorized_users_count > active_licenses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot have more Authorized Users ({authorized_users_count}) than Active Licenses ({active_licenses}). "
                       f"Please increase Active Licenses or remove {authorized_users_count - active_licenses} user(s)."
            )
        
        # If updating licenseHistory, ensure new active licenses don't go below current user count
        if "licenseHistory" in update_data:
            new_active_licenses = _compute_active_licenses(update_data["licenseHistory"])
            current_active_user_count = _compute_authorized_users_count(current_org.get("authorizedUsers", []))
            
            if new_active_licenses < current_active_user_count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot reduce Active Licenses to {new_active_licenses}. "
                           f"Currently have {current_active_user_count} Active Authorized Users. "
                           f"Please remove {current_active_user_count - new_active_licenses} user(s) first."
                )
        
        await db.organizations.update_one({"_id": _to_object_id(org_id)}, {"$set": update_data})

    document = await db.organizations.find_one({"_id": _to_object_id(org_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if "authorizedUsers" in update_data or "levelConfiguration" in update_data:
        await _sync_auth_service_users_for_org(document)

    return _serialize_document(document)


@app.delete("/organizations/{org_id}")
async def delete_organization(org_id: str):
    db = get_database()
    result = await db.organizations.delete_one({"_id": _to_object_id(org_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return {"status": "ok"}


async def _is_org_admin_email_taken(db, email: str, exclude_admin_id: Optional[str] = None) -> bool:
    normalized = _normalize_email(email)
    if await db.portal_users.find_one({"email": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}}):
        return True
    async for org in db.organizations.find({"orgAdminUsers.email": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}}):
        for admin in org.get("orgAdminUsers", []):
            if _normalize_email(admin.get("email")) == normalized and admin.get("id") != exclude_admin_id:
                return True
    return False


@app.post("/organizations/{org_id}/admin-users", response_model=Organization)
async def create_org_admin_user(org_id: str, payload: OrgAdminUserIn):
    db = get_database()
    org = await db.organizations.find_one({"_id": _to_object_id(org_id)})
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if await _is_org_admin_email_taken(db, payload.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    admin_entry = payload.model_dump()
    admin_entry["id"] = f"org-admin-{ObjectId()}"
    admin_entry["password"] = hash_password(admin_entry["password"])
    admin_entry["createdDate"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    await db.organizations.update_one(
        {"_id": org["_id"]},
        {"$push": {"orgAdminUsers": admin_entry}},
    )
    document = await db.organizations.find_one({"_id": org["_id"]})
    return _serialize_document(document)


@app.put("/organizations/{org_id}/admin-users/{admin_id}", response_model=Organization)
async def update_org_admin_user(org_id: str, admin_id: str, payload: OrgAdminUserUpdate):
    db = get_database()
    org = await db.organizations.find_one({"_id": _to_object_id(org_id)})
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    admin_users = org.get("orgAdminUsers", [])
    target = next((a for a in admin_users if a.get("id") == admin_id), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org admin user not found")

    update_data = payload.model_dump(exclude_none=True)
    if "email" in update_data and await _is_org_admin_email_taken(db, update_data["email"], exclude_admin_id=admin_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    if "password" in update_data:
        update_data["password"] = hash_password(update_data["password"])

    target.update(update_data)

    await db.organizations.update_one(
        {"_id": org["_id"]},
        {"$set": {"orgAdminUsers": admin_users}},
    )
    document = await db.organizations.find_one({"_id": org["_id"]})
    return _serialize_document(document)


@app.delete("/organizations/{org_id}/admin-users/{admin_id}")
async def delete_org_admin_user(org_id: str, admin_id: str):
    db = get_database()
    result = await db.organizations.update_one(
        {"_id": _to_object_id(org_id)},
        {"$pull": {"orgAdminUsers": {"id": admin_id}}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return {"status": "ok"}


@app.post("/organizations/{org_id}/admin-users/{admin_id}/reset-password")
async def reset_org_admin_password(org_id: str, admin_id: str, payload: PasswordResetRequest):
    db = get_database()
    if payload.password != payload.confirmPassword:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match")

    org = await db.organizations.find_one({"_id": _to_object_id(org_id)})
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    admin_users = org.get("orgAdminUsers", [])
    target = next((a for a in admin_users if a.get("id") == admin_id), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Org admin user not found")

    target["password"] = hash_password(payload.password)
    await db.organizations.update_one(
        {"_id": org["_id"]},
        {"$set": {"orgAdminUsers": admin_users}},
    )
    return {"status": "ok", "message": "Password reset successfully."}


@app.post("/authorized-users/register")
async def register_authorized_user(payload: RegisterAuthorizedUserRequest):
    """
    Called by the investor-facing trading app after a successful login, so the
    matching authorized user's status here flips from Invited to Registered
    automatically instead of requiring a manual admin edit.
    """
    db = get_database()
    normalized_email = _normalize_email(payload.email)

    org = await db.organizations.find_one(
        {"authorizedUsers.email": {"$regex": f"^{re.escape(normalized_email)}$", "$options": "i"}}
    )
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Authorized user not found")

    authorized_users = org.get("authorizedUsers", [])
    updated = False
    for user in authorized_users:
        if _normalize_email(user.get("email")) != normalized_email:
            continue
        if str(user.get("status") or "").strip().lower() != "expired":
            user["status"] = "Registered"
            updated = True
        for assignment in user.get("licenseAssignments", []):
            if str(assignment.get("status") or "").strip().lower() != "expired":
                assignment["status"] = "Registered"

    if updated:
        await db.organizations.update_one(
            {"_id": org["_id"]},
            {"$set": {"authorizedUsers": authorized_users}},
        )

    return {"status": "ok", "organizationId": str(org["_id"]), "registered": updated}


@app.get("/authorized-users/{email}/level")
async def get_authorized_user_level(email: str):
    """
    Called by the investor-facing trading app (via its own backend) so a
    user's admin-assigned Level and their organization's Level Configuration
    amounts can be applied on login instead of being hardcoded client-side.
    """
    db = get_database()
    normalized_email = _normalize_email(email)

    org = await db.organizations.find_one(
        {"authorizedUsers.email": {"$regex": f"^{re.escape(normalized_email)}$", "$options": "i"}}
    )
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Authorized user not found")

    user = next(
        (u for u in org.get("authorizedUsers", []) if _normalize_email(u.get("email")) == normalized_email),
        None,
    )
    level_configuration = org.get("levelConfiguration") or DEFAULT_LEVEL_CONFIG
    return {
        "email": normalized_email,
        "level": (user or {}).get("level") or "Beginner",
        "levelConfiguration": level_configuration,
    }


@app.get("/users/with-organizations")
async def list_users_with_organizations():
    """
    Demonstrates MongoDB $lookup (JOIN) to fetch users with their related organizations
    This is like SQL: SELECT * FROM portal_users LEFT JOIN organizations ON ...
    """
    db = get_database()
    
    # MongoDB Aggregation Pipeline with $lookup (JOIN)
    pipeline = [
        # LOOKUP 1: Join with organizations where user email matches primary contact
        {
            "$lookup": {
                "from": "organizations",
                "let": {"user_email": "$email"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$or": [
                                    {"$eq": ["$contact.primary.email", "$$user_email"]},
                                    {"$eq": ["$contact.secondary.email", "$$user_email"]}
                                ]
                            }
                        }
                    },
                    # Only return specific fields
                    {
                        "$project": {
                            "name": 1,
                            "status": 1,
                            "activeLicenses": 1
                        }
                    }
                ],
                "as": "managed_organizations"
            }
        },
        # Add computed fields
        {
            "$addFields": {
                "total_managed_orgs": {"$size": "$managed_organizations"},
                "is_org_manager": {"$gt": [{"$size": "$managed_organizations"}, 0]}
            }
        },
        # Sort by name
        {"$sort": {"name": 1}}
    ]
    
    cursor = db.portal_users.aggregate(pipeline)
    users = await cursor.to_list(length=1000)
    role_display_map = await _get_role_display_map(db)
    return [_enrich_user_role(_serialize_document(user), role_display_map) for user in users]


@app.get("/users", response_model=list[PortalUser])
async def list_users():
    db = get_database()
    documents = await db.portal_users.find().to_list(length=1000)
    role_display_map = await _get_role_display_map(db)
    return [_enrich_user_role(_serialize_document(doc), role_display_map) for doc in documents]


@app.get("/users/{user_id}", response_model=PortalUser)
async def get_user(user_id: str):
    db = get_database()
    document = await db.portal_users.find_one({"_id": _to_object_id(user_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    role_display_map = await _get_role_display_map(db)
    return _enrich_user_role(_serialize_document(document), role_display_map)


@app.post("/users", response_model=PortalUser, status_code=status.HTTP_201_CREATED)
async def create_user(payload: PortalUserIn):
    db = get_database()
    data = payload.model_dump(by_alias=True, exclude_none=True)
    email_normalized = _normalize_email(data.get("email"))
    if email_normalized:
        existing_user = await db.portal_users.find_one(
            {"email": {"$regex": f"^{re.escape(email_normalized)}$", "$options": "i"}}
        )
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists",
            )
    role_input = str(data.pop("role", "") or "").strip()
    data["roleKey"] = _to_role_key(role_input or DEFAULT_ROLE_DISPLAY_NAME)
    data["role"] = role_input or DEFAULT_ROLE_DISPLAY_NAME
    data.setdefault("status", "Pending")
    
    # Hash password before storing
    if "password" in data:
        data["password"] = hash_password(data["password"])
    
    result = await db.portal_users.insert_one(data)
    document = await db.portal_users.find_one({"_id": result.inserted_id})
    role_display_map = await _get_role_display_map(db)
    return _enrich_user_role(_serialize_document(document), role_display_map)


@app.put("/users/{user_id}", response_model=PortalUser)
async def update_user(user_id: str, payload: PortalUserUpdate):
    db = get_database()
    update_data = payload.model_dump(by_alias=True, exclude_none=True)
    if "email" in update_data and update_data["email"]:
        email_normalized = _normalize_email(update_data.get("email"))
        existing_user = await db.portal_users.find_one(
            {
                "email": {"$regex": f"^{re.escape(email_normalized)}$", "$options": "i"},
                "_id": {"$ne": _to_object_id(user_id)},
            }
        )
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists",
            )
    if "role" in update_data:
        role_input = str(update_data["role"] or "").strip()
        update_data["roleKey"] = _to_role_key(role_input or DEFAULT_ROLE_DISPLAY_NAME)
    
    # Hash password if it's being updated
    if "password" in update_data and update_data["password"]:
        update_data["password"] = hash_password(update_data["password"])
    
    if update_data:
        await db.portal_users.update_one({"_id": _to_object_id(user_id)}, {"$set": update_data})
    document = await db.portal_users.find_one({"_id": _to_object_id(user_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    role_display_map = await _get_role_display_map(db)
    return _enrich_user_role(_serialize_document(document), role_display_map)


@app.delete("/users/{user_id}")
async def delete_user(user_id: str):
    db = get_database()
    result = await db.portal_users.delete_one({"_id": _to_object_id(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"status": "ok"}


@app.post("/users/{user_id}/send-reset-email")
async def send_password_reset_email(user_id: str, payload: PasswordResetRequest):
    """Update user password and send confirmation email"""
    db = get_database()
    
    # Get user from database
    user = await db.portal_users.find_one({"_id": _to_object_id(user_id)})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    user_email = user.get("email")
    user_name = user.get("name", "User")
    
    if payload.password != payload.confirmPassword:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match",
        )

    try:
        # Update user with new password
        hashed_temp_password = hash_password(payload.password)
        await db.portal_users.update_one(
            {"_id": _to_object_id(user_id)},
            {"$set": {"password": hashed_temp_password}}
        )

        # Send confirmation email (no temporary password)
        email_sent = send_password_changed_email(user_email, user_name)

        if email_sent:
            return {
                "status": "success",
                "message": f"Password updated and email sent to {user_email}",
                "email": user_email,
                "emailSent": True,
            }

        return {
            "status": "warning",
            "message": f"Password updated, but confirmation email could not be sent to {user_email}",
            "email": user_email,
            "emailSent": False,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update password: {str(e)}"
        )


def send_password_changed_email(email: str, name: str):
    """Send password changed confirmation email via Resend."""
    subject = "InvestEd Admin Portal - Password Changed"

    html_body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h2 style="color: #1f2937;">Password Changed</h2>
                <p>Dear <strong>{name}</strong>,</p>
                <p>Your password has been changed successfully.</p>
                <p>If you did not request this change, please contact your administrator immediately.</p>
                
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
                
                <p style="color: #999; font-size: 11px; margin-top: 20px;">
                    InvestEd Admin Portal<br>
                    ?? 2026 InvestEd. All rights reserved.<br>
                    <a href="https://invested.com" style="color: #0066cc; text-decoration: none;">www.invested.com</a>
                </p>
            </div>
        </body>
    </html>
    """

    print(f"Sending password changed email to {email} via Resend...")
    return _send_email(email, subject, html_body)


def send_reset_email(email: str, name: str, temp_password: str):
    """Backward-compatible wrapper (temporary passwords are no longer sent)."""
    return send_password_changed_email(email, name)



@app.get("/roles", response_model=list[Role])
async def list_roles():
    db = get_database()
    # await _ensure_default_roles(db)
    documents = await db.roles.find().sort("displayName", 1).to_list(length=500)
    return [_serialize_document(doc) for doc in documents]


@app.put("/roles/{role_key}", response_model=Role)
async def update_role(role_key: str, payload: RoleUpdate):
    db = get_database()
    await _ensure_default_roles(db)
    update_data = payload.model_dump(by_alias=True, exclude_none=True)
    if not update_data:
        document = await db.roles.find_one({"key": role_key})
        if not document:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
        return _serialize_document(document)

    result = await db.roles.update_one({"key": role_key}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    document = await db.roles.find_one({"key": role_key})
    return _serialize_document(document)


@app.get("/check-email/{org_id}/{email}")
async def check_email_availability(org_id: str, email: str):
    """
    Check if email exists in a specific organization's authorized users
    Returns organization-wise email availability status
    """
    db = get_database()
    
    # Find organization
    organization = await db.organizations.find_one({"_id": _to_object_id(org_id)})
    
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    
    # Check if email exists in authorized users list for this organization
    authorized_users = organization.get("authorizedUsers", [])
    
    # Check if email exists and is not expired/deleted
    for user in authorized_users:
        if user.get("email") == email and user.get("status") != "Expired":
            return {
                "available": False,
                "message": "This email already exists in this organization"
            }
    
    return {
        "available": True,
        "message": "Email is available"
    }
