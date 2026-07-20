from fastapi import APIRouter, HTTPException, status

from .db import get_database
from .portability_schemas import (
    AddUserByEmailRequest,
    AssignLicenseRequest,
    ExpireLicensesRequest,
    ReassignLicenseRequest,
)
from .services.cross_org_portability_service import (
    PortabilityError,
    add_user_by_email,
    assign_license,
    expire_licenses,
    get_active_assignment,
    get_user_by_email,
    list_licenses_for_organization,
    list_organizations_for_portability,
    reassign_license,
)

router = APIRouter(prefix="/v2/portability", tags=["portability"])


def _to_http_status(error_code: str) -> int:
    mapping = {
        "INVALID_ID": status.HTTP_400_BAD_REQUEST,
        "SEAT_LIMIT_EXCEEDED": status.HTTP_409_CONFLICT,
        "ACTIVE_ASSIGNMENT_EXISTS": status.HTTP_409_CONFLICT,
        "SAME_LICENSE": status.HTTP_409_CONFLICT,
        "SEAT_RACE_CONDITION": status.HTTP_409_CONFLICT,
        "ORG_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "USER_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "LICENSE_NOT_FOUND": status.HTTP_404_NOT_FOUND,
        "NO_ACTIVE_ASSIGNMENT": status.HTTP_404_NOT_FOUND,
        "LICENSE_INACTIVE_OR_EXPIRED": status.HTTP_400_BAD_REQUEST,
    }
    return mapping.get(error_code, status.HTTP_400_BAD_REQUEST)


@router.post("/users/add-by-email")
async def add_user_by_email_endpoint(payload: AddUserByEmailRequest):
    db = get_database()
    try:
        result = await add_user_by_email(
            db,
            organization_id=payload.organization_id,
            email=str(payload.email),
            actor_id=payload.actor_id,
        )
        return result
    except PortabilityError as exc:
        raise HTTPException(status_code=_to_http_status(exc.code), detail=exc.message) from exc


@router.post("/licenses/assign")
async def assign_license_endpoint(payload: AssignLicenseRequest):
    db = get_database()
    try:
        return await assign_license(
            db,
            organization_id=payload.organization_id,
            license_id=payload.license_id,
            user_id=payload.user_id,
            actor_id=payload.actor_id,
        )
    except PortabilityError as exc:
        raise HTTPException(status_code=_to_http_status(exc.code), detail=exc.message) from exc


@router.post("/licenses/reassign")
async def reassign_license_endpoint(payload: ReassignLicenseRequest):
    db = get_database()
    try:
        return await reassign_license(
            db,
            organization_id=payload.organization_id,
            user_id=payload.user_id,
            new_license_id=payload.new_license_id,
            actor_id=payload.actor_id,
        )
    except PortabilityError as exc:
        raise HTTPException(status_code=_to_http_status(exc.code), detail=exc.message) from exc


@router.post("/licenses/expire")
async def expire_licenses_endpoint(payload: ExpireLicensesRequest):
    db = get_database()
    return await expire_licenses(db, batch_size=payload.batch_size)


@router.get("/organizations")
async def list_portability_organizations_endpoint():
    db = get_database()
    return await list_organizations_for_portability(db)


@router.get("/licenses/{organization_id}")
async def list_portability_licenses_endpoint(organization_id: str):
    db = get_database()
    try:
        return await list_licenses_for_organization(db, organization_id=organization_id)
    except PortabilityError as exc:
        raise HTTPException(status_code=_to_http_status(exc.code), detail=exc.message) from exc


@router.get("/users/by-email/{email}")
async def resolve_user_by_email_endpoint(email: str):
    db = get_database()
    try:
        return await get_user_by_email(db, email=email)
    except PortabilityError as exc:
        raise HTTPException(status_code=_to_http_status(exc.code), detail=exc.message) from exc


@router.get("/assignments/active/{organization_id}/{user_id}")
async def get_active_assignment_endpoint(organization_id: str, user_id: str):
    db = get_database()
    try:
        result = await get_active_assignment(db, organization_id=organization_id, user_id=user_id)
        return result or {}
    except PortabilityError as exc:
        raise HTTPException(status_code=_to_http_status(exc.code), detail=exc.message) from exc
