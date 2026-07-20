from typing import Optional

from pydantic import BaseModel, EmailStr


class AddUserByEmailRequest(BaseModel):
    organization_id: str
    email: EmailStr
    actor_id: Optional[str] = None


class AssignLicenseRequest(BaseModel):
    organization_id: str
    license_id: str
    user_id: str
    actor_id: Optional[str] = None


class ReassignLicenseRequest(BaseModel):
    organization_id: str
    user_id: str
    new_license_id: str
    actor_id: Optional[str] = None


class ExpireLicensesRequest(BaseModel):
    batch_size: int = 500

