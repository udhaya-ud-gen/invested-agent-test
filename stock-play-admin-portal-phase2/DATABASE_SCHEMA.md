# Database Schema Documentation

## Database: stock_play_admin
**MongoDB Connection:** `mongodb://localhost:27017`

---

## Collections

### 1. portal_users

**Description:** Stores user credentials for admin portal authentication

**Schema:**
```javascript
{
  _id: ObjectId,                    // MongoDB auto-generated ID
  name: String,                     // Full name of the user
  email: String,                    // Unique email address (used for login)
  password: String,                 // Plain text password (stored securely)
  role: String,                     // User role: "Super Admin" | "Sales Admin"
  createdDate: String,              // Date format: "YYYY-MM-DD"
  status: String                    // Status: "Active" | "Pending" | "Inactive"
}
```

**Indexes:**
- `_id` (default)
- Email should be unique for authentication

**Example Document:**
```json
{
  "_id": "698c37b921c42267226c1822",
  "name": "John Smith",
  "email": "john.smith@stockplay.com",
  "password": "john123",
  "role": "Super Admin",
  "createdDate": "2024-01-16",
  "status": "Active"
}
```

**Security Notes:**
- Passwords are stored in plain text (consider implementing bcrypt hashing for production)
- Password field is excluded from API responses automatically
- Login requires both email and password to match

---

### 2. organizations

**Description:** Stores organization/company information with licenses and users

**Schema:**
```javascript
{
  _id: ObjectId,                    // MongoDB auto-generated ID
  name: String,                     // Organization name
  createdDate: String,              // Date format: "YYYY-MM-DD"
  expiryDate: String,               // Date format: "YYYY-MM-DD"
  status: String,                   // Status: "Active" | "Pending" | "Expired"
  activeLicenses: Number,           // Number of active licenses
  totalUsers: Number,               // Total number of users
  activeMobileUsers: Number,        // Active mobile users count
  
  address: {                        // Organization address
    streetLine1: String,
    streetLine2: String,
    city: String,
    state: String,
    country: String,
    pincode: String
  },
  
  contact: {                        // Contact information
    primary: {
      phone: String,
      email: String
    },
    secondary: {
      phone: String,
      email: String
    }
  },
  
  licenseHistory: [                 // Array of license records
    {
      id: String,                   // License ID
      type: String,                 // License type: "Premium" | "Standard"
      purchaseDate: String,         // Date format: "YYYY-MM-DD"
      expiryDate: String,           // Date format: "YYYY-MM-DD"
      count: Number,                // Number of licenses
      status: String                // Status: "Active" | "Expired"
    }
  ],
  
  authorizedUsers: [                // Array of authorized users
    {
      id: String,                   // User ID
      name: String,                 // User name
      email: String,                // User email
      createdDate: String,          // Date format: "YYYY-MM-DD"
      expiryDate: String,           // Date format: "YYYY-MM-DD"
      status: String                // Status: "Active" | "Pending"
    }
  ]
}
```

**Indexes:**
- `_id` (default)

**Example Document:**
```json
{
  "_id": "698c37b921c42267226c1815",
  "name": "Tech Innovators Inc",
  "createdDate": "2024-01-15",
  "expiryDate": "2025-01-15",
  "status": "Active",
  "activeLicenses": 25,
  "totalUsers": 48,
  "activeMobileUsers": 18,
  "address": {
    "streetLine1": "120 Market Street",
    "streetLine2": "Suite 400",
    "city": "San Francisco",
    "state": "CA",
    "country": "USA",
    "pincode": "94105"
  },
  "contact": {
    "primary": {
      "phone": "+1 415 555 0199",
      "email": "support@techinnovators.com"
    },
    "secondary": {
      "phone": "+1 415 555 0144",
      "email": "billing@techinnovators.com"
    }
  },
  "licenseHistory": [
    {
      "id": "lic-001",
      "type": "Premium",
      "purchaseDate": "2024-01-15",
      "expiryDate": "2025-01-15",
      "count": 25,
      "status": "Active"
    }
  ],
  "authorizedUsers": [
    {
      "id": "auth-001",
      "name": "John Smith",
      "email": "john.smith@techinnovators.com",
      "createdDate": "2024-01-18",
      "expiryDate": "2025-01-15",
      "status": "Pending"
    }
  ]
}
```

---

## API Endpoints

### Authentication

**POST /login**
- Request: `{ email: string, password: string }`
- Response: `PortalUser` (without password field)
- Validates credentials against portal_users collection

### Portal Users (CRUD)

**GET /users**
- Returns: Array of all portal users (without passwords)

**GET /users/{user_id}**
- Returns: Single portal user (without password)

**POST /users**
- Request: `{ name, email, password, role, createdDate, status }`
- Response: Created user (without password)

**PUT /users/{user_id}**
- Request: Partial update fields
- Response: Updated user (without password)

**DELETE /users/{user_id}**
- Returns: `{ status: "ok" }`

### Organizations (CRUD)

**GET /organizations**
- Returns: Array of all organizations

**GET /organizations/{org_id}**
- Returns: Single organization

**POST /organizations**
- Request: Organization data
- Response: Created organization

**PUT /organizations/{org_id}**
- Request: Partial update fields
- Response: Updated organization

**DELETE /organizations/{org_id}**
- Returns: `{ status: "ok" }`

---

## Current Database Statistics

- **Organizations:** 6 documents
- **Portal Users:** 12 documents (including test users)

---

## Authentication Flow

1. User enters email and password in login form
2. Frontend calls POST /login with credentials
3. Backend queries portal_users collection by email
4. Backend verifies password matches stored password
5. If valid, returns user data (without password)
6. If invalid, returns 401 Unauthorized error
7. Frontend stores user data and redirects to dashboard

---

## Notes

- All date fields use "YYYY-MM-DD" format
- Password field is automatically excluded from all API responses
- MongoDB ObjectId is converted to string "id" field in API responses
- User must exist in portal_users collection with valid password to login
