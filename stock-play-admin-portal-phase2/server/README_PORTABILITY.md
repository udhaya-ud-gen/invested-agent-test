# Cross-Org Portability (MongoDB)

This module adds isolated APIs for global users + org license assignments.
Existing endpoints are unchanged.

## Files Added

- `app/migrations/mongo_20260218_cross_org_portability.py`
- `app/portability_schemas.py`
- `app/services/cross_org_portability_service.py`
- `app/portability_routes.py`

## New Routes

- `POST /v2/portability/users/add-by-email`
- `POST /v2/portability/licenses/assign`
- `POST /v2/portability/licenses/reassign`
- `POST /v2/portability/licenses/expire`
- `GET /v2/portability/organizations`
- `GET /v2/portability/licenses/{organization_id}`
- `GET /v2/portability/users/by-email/{email}`
- `GET /v2/portability/assignments/active/{organization_id}/{user_id}`

## UI Route

- Frontend page: `/portability`
- Sidebar menu item: `Portability`

## 1) Run Migration

From `server`:

```powershell
python -m app.migrations.mongo_20260218_cross_org_portability
```

What it does:

- creates/updates validators for:
  - `users`
  - `organizations`
  - `licenses`
  - `license_assignments`
- creates indexes:
  - unique `users.email_canonical`
  - partial unique active assignment per `(user_id, organization_id)`
  - assignment lookup indexes
  - license lifecycle index

## 2) MongoDB Compass Verification

Open DB in Compass and check:

1. Collection `users` exists and has index `ux_users_email_canonical` (`unique: true`).
2. Collection `license_assignments` has index `ux_assignments_active_user_org` with:
   - keys: `user_id`, `organization_id`
   - `unique: true`
   - partial filter: `{ "status": "active" }`
3. Collection `licenses` has index `ix_licenses_org_status_expires`.
4. Validators are visible in collection validation rules.

## 3) Sample Documents

### users

```json
{
  "email": "alice@acme.com",
  "email_canonical": "alice@acme.com",
  "name": "Alice",
  "status": "active",
  "created_at": { "$date": "2026-02-18T10:00:00Z" },
  "updated_at": { "$date": "2026-02-18T10:00:00Z" }
}
```

### licenses

```json
{
  "organization_id": { "$oid": "65f002222222222222222222" },
  "plan_code": "PRO",
  "seat_limit": 100,
  "seats_used": 0,
  "expires_at": { "$date": "2026-12-31T23:59:59Z" },
  "status": "active",
  "version": 0,
  "created_at": { "$date": "2026-02-18T10:00:00Z" },
  "updated_at": { "$date": "2026-02-18T10:00:00Z" }
}
```

## 4) API Request Examples

Use your local host/port.

### Add user by email

```http
POST /v2/portability/users/add-by-email
Content-Type: application/json

{
  "organization_id": "65f002222222222222222222",
  "email": "alice@acme.com",
  "actor_id": "admin_123"
}
```

### Assign license

```http
POST /v2/portability/licenses/assign
Content-Type: application/json

{
  "organization_id": "65f002222222222222222222",
  "license_id": "65f003333333333333333333",
  "user_id": "65f001111111111111111111",
  "actor_id": "admin_123"
}
```

### Reassign license

```http
POST /v2/portability/licenses/reassign
Content-Type: application/json

{
  "organization_id": "65f002222222222222222222",
  "user_id": "65f001111111111111111111",
  "new_license_id": "65f005555555555555555555",
  "actor_id": "admin_123"
}
```

### Expire licenses (batch)

```http
POST /v2/portability/licenses/expire
Content-Type: application/json

{
  "batch_size": 500
}
```

## 5) Error Semantics

- `400`: invalid IDs, inactive/expired license
- `404`: org/user/license not found, no active assignment
- `409`: seat limit exceeded, active assignment exists, race condition

## 6) Safety Notes

- Assign and reassign use MongoDB transactions (replica set required).
- Expiry operation is intentionally non-transactional by design.
- No integration tests were run yet.
- Existing endpoints are not modified except adding isolated router registration.

## 7) Recommended Manual Smoke Test

1. Create org and license docs.
2. Call `add-by-email` for new email.
3. Call `assign`.
4. Call `reassign` to another license in same org.
5. Set `expires_at` to past and call `expire`.
6. Confirm:
   - `users` doc unchanged
   - assignment statuses moved correctly
   - seat counters updated
