# MongoDB Joins (Lookup) Implementation

## Overview
This document explains how MongoDB **$lookup** (equivalent to SQL JOIN) is implemented in the Stock Play Admin authentication system.

---

## What are MongoDB Joins?

MongoDB doesn't have traditional SQL JOINs, but uses **$lookup** in aggregation pipelines to combine data from multiple collections. This is similar to LEFT OUTER JOIN in SQL.

---

## Implementation

### 1. Login with Lookup (JOIN)

**Location:** `server/app/main.py` - `/login endpoint`

**SQL Equivalent:**
```sql
SELECT u.*, COUNT(o.id) as organization_count
FROM portal_users u
LEFT JOIN organizations o ON u.email = o.contact_primary_email OR u.email = o.contact_secondary_email
WHERE u.email = 'user@example.com'
GROUP BY u.id
```

**MongoDB Implementation:**
```python
pipeline = [
    # WHERE clause - Match user by email
    {"$match": {"email": payload.email}},
    
    # LEFT JOIN - Join with organizations
    {
        "$lookup": {
            "from": "organizations",              # Table to join
            "localField": "email",                # Key from portal_users
            "foreignField": "contact.primary.email",  # Key from organizations
            "as": "related_organizations"         # Output field name
        }
    },
    
    # Add computed columns
    {
        "$addFields": {
            "organization_count": {"$size": "$related_organizations"},
            "has_organizations": {"$gt": [{"$size": "$related_organizations"}, 0]}
        }
    }
]

users = await db.portal_users.aggregate(pipeline).to_list(1)
```

### 2. Users with Organizations Endpoint

**Location:** `server/app/main.py` - `/users/with-organizations endpoint`

**SQL Equivalent:**
```sql
SELECT 
    u.*,
    o.name as org_name,
    o.status as org_status,
    COUNT(o.id) as total_managed_orgs
FROM portal_users u
LEFT JOIN organizations o ON (
    u.email = o.contact_primary_email OR 
    u.email = o.contact_secondary_email
)
GROUP BY u.id
ORDER BY u.name
```

**MongoDB Implementation:**
```python
pipeline = [
    # Complex JOIN with multiple conditions
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
    
    # Aggregate functions
    {
        "$addFields": {
            "total_managed_orgs": {"$size": "$managed_organizations"},
            "is_org_manager": {"$gt": [{"$size": "$managed_organizations"}, 0]}
        }
    },
    
    # ORDER BY
    {"$sort": {"name": 1}}
]
```

---

## MongoDB vs SQL Comparison

| SQL | MongoDB |
|-----|---------|
| `SELECT` | `$project` or implicit selection |
| `FROM` | Collection name |
| `WHERE` | `$match` |
| `JOIN` | `$lookup` |
| `LEFT JOIN` | `$lookup` (default behavior) |
| `GROUP BY` | `$group` |
| `HAVING` | `$match` (after $group) |
| `ORDER BY` | `$sort` |
| `LIMIT` | `$limit` |
| `COUNT(*)` | `$count` or `$size` |

---

## Authentication Flow with Joins

1. **User submits email and password**
2. **MongoDB Aggregation Pipeline executes:**
   - `$match`: Find user by email (WHERE clause)
   - `$lookup`: Join with organizations (LEFT JOIN)
   - `$addFields`: Calculate related data (computed columns)
   - `$limit`: Return only 1 result
3. **Password validation:** Compare stored password with input
4. **Return user data** with joined information

---

## Benefits of MongoDB Lookup

✅ **Flexible Joins:** Can join on any field, including nested fields  
✅ **Complex Conditions:** Support for OR, AND, nested conditions  
✅ **Aggregation:** Can compute values during join  
✅ **Performance:** Indexed fields make lookups fast  
✅ **Nested Results:** Results can be nested arrays or objects  

---

## Example API Calls

### Login (with JOIN)
```bash
POST http://127.0.0.1:8000/login
Content-Type: application/json

{
  "email": "sanjaigiri001@gmail.com",
  "password": "sanjai giri 123"
}
```

**Response includes:**
- User basic info (name, email, role)
- Related organizations count (from JOIN)
- Organization management status (computed field)

### Get Users with Organizations (JOIN)
```bash
GET http://127.0.0.1:8000/users/with-organizations
```

**Response includes:**
- All users
- Each user's managed organizations (from JOIN)
- Total count of managed orgs (aggregated)
- Organization details (joined data)

---

## Testing

All tests passed ✓ :
- Login with correct credentials
- Login with wrong password (rejected)
- Login with non-existent email (rejected)
- Users with organizations endpoint (joins working)

---

## Collections Structure

### portal_users
```
_id, name, email, password, role, createdDate, status
```

### organizations
```
_id, name, status, contact: {
  primary: { email, phone },
  secondary: { email, phone }
}, ...
```

**Join Key:** `portal_users.email` ↔ `organizations.contact.primary.email`

---

## Security Notes

- Passwords are verified but never returned in API responses
- MongoDB queries use parameterized values (no injection risk)
- All authentication errors return generic "Invalid email or password"
- Password field is automatically removed from responses

---

## Summary

✅ MongoDB **$lookup** is now implemented in the authentication system  
✅ Acts as **JOIN** between portal_users and organizations  
✅ Demonstrates full MongoDB aggregation pipeline  
✅ All data stored in MongoDB with proper relationships  
✅ Login system uses lookup to enrich user data with related information
