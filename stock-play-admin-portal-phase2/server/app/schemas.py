from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, validator


class Address(BaseModel):
    streetLine1: Optional[str] = None
    streetLine2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None


class ContactInfo(BaseModel):
    phone: Optional[str] = None
    email: Optional[EmailStr] = None

    @validator('email', 'phone', pre=True)
    def empty_str_to_none(cls, v):
        return None if v == '' else v


class Contact(BaseModel):
    primary: ContactInfo = ContactInfo()
    secondary: ContactInfo = ContactInfo()


class LicenseHistory(BaseModel):
    licenseCode: Optional[str] = None
    purchaseDate: str
    expiryDate: str
    count: int = 0
    status: str = "Pending"


class LevelConfig(BaseModel):
    level: str
    startingBalance: float = 0
    gainTarget: float = 0


class AuthorizedUser(BaseModel):
    name: str
    email: EmailStr
    createdDate: str
    expiryDate: str
    status: str = "Pending"
    licenseId: Optional[str] = None
    licenseCode: Optional[str] = None
    level: Optional[str] = None
    licenseAssignments: List[dict] = Field(default_factory=list)

    class Config:
        extra = "allow"


class OrgAdminUser(BaseModel):
    id: Optional[str] = None
    name: str
    email: EmailStr
    password: Optional[str] = None
    createdDate: str
    status: str = "Active"

    class Config:
        extra = "allow"


class Organization(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    name: str
    createdDate: str
    expiryDate: Optional[str] = None
    status: str = "Pending"
    activeLicenses: Optional[int] = None  # Computed dynamically
    authorizedUsersCount: Optional[int] = None  # Computed dynamically
    activeMobileUsers: int = 0
    address: Address = Address()
    contact: Contact = Contact()
    licenseHistory: List[LicenseHistory] = Field(default_factory=list)
    authorizedUsers: List[AuthorizedUser] = Field(default_factory=list)
    levelConfiguration: List[LevelConfig] = Field(default_factory=list)
    orgAdminUsers: List[OrgAdminUser] = Field(default_factory=list)

    class Config:
        allow_population_by_field_name = True
        extra = "allow"


class PortalUser(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    name: str
    email: EmailStr
    roleKey: Optional[str] = None
    roleDisplayName: Optional[str] = None
    role: str = "Super Admin"
    password: Optional[str] = None
    createdDate: str
    status: str = "Pending"
    organizationId: Optional[str] = None
    organizationName: Optional[str] = None

    class Config:
        allow_population_by_field_name = True
        extra = "allow"


class OrganizationIn(BaseModel):
    name: str
    createdDate: str
    expiryDate: Optional[str] = None
    status: Optional[str] = "Active"
    activeMobileUsers: Optional[int] = 0
    address: Optional[Address] = Address()
    contact: Optional[Contact] = Contact()
    licenseHistory: List[LicenseHistory] = Field(default_factory=list)
    authorizedUsers: List[AuthorizedUser] = Field(default_factory=list)
    levelConfiguration: List[LevelConfig] = Field(default_factory=list)
    orgAdminUsers: List[OrgAdminUser] = Field(default_factory=list)

    class Config:
        extra = "allow"


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    createdDate: Optional[str] = None
    expiryDate: Optional[str] = None
    status: Optional[str] = None
    activeMobileUsers: Optional[int] = None
    address: Optional[Address] = None
    contact: Optional[Contact] = None
    licenseHistory: Optional[List[LicenseHistory]] = None
    authorizedUsers: Optional[List[AuthorizedUser]] = None
    levelConfiguration: Optional[List[LevelConfig]] = None
    orgAdminUsers: Optional[List[OrgAdminUser]] = None

    class Config:
        extra = "allow"


class OrgAdminUserIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    status: Optional[str] = "Active"

    class Config:
        extra = "allow"


class OrgAdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    status: Optional[str] = None

    class Config:
        extra = "allow"


class PortalUserIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Optional[str] = "Super Admin"
    createdDate: str
    status: Optional[str] = "Pending"

    class Config:
        extra = "allow"


class PortalUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    roleKey: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    createdDate: Optional[str] = None
    status: Optional[str] = None

    class Config:
        extra = "allow"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterAuthorizedUserRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    password: str
    confirmPassword: str


class Role(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    key: str
    displayName: str
    description: Optional[str] = None
    isActive: bool = True

    class Config:
        allow_population_by_field_name = True
        extra = "allow"


class RoleUpdate(BaseModel):
    displayName: Optional[str] = None
    description: Optional[str] = None
    isActive: Optional[bool] = None

    class Config:
        extra = "allow"
