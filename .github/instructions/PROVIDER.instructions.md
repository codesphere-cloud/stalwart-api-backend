---
description: "Schema and validation rules for provider.yml configuration. Use when creating or editing landscape or REST backend provider definitions."
applyTo: "**/provider.yml, **/provider.yml.example, **/provider.rest.yml.example"
---

# Provider Definition Schema Reference

A service provider defines a reusable blueprint that others can instantiate as managed services on the Codesphere platform. Providers can be backed by either a **Codesphere landscape** or a **custom REST backend**. The `provider.yml` file at the repository root defines all metadata and configuration schemas.

> **Important:** Publishing providers requires cluster admin permissions. Team admins can request providers scoped to specific teams.

---

## 1. provider.yml Top-Level Structure

```yaml
name: string                   # REQUIRED — unique provider identifier
version: string                # REQUIRED — version in format v[0-9]+ (e.g., v1)
author: string                 # REQUIRED — organization or individual
displayName: string            # REQUIRED — human-readable name for Marketplace UI
iconUrl: string                # OPTIONAL — URL to provider icon
category: string               # REQUIRED — grouping category
description: string            # REQUIRED — markdown-formatted description

backend:                       # REQUIRED — deployment backend configuration (pick one)
  landscape:                   # Option A: Landscape-based backend
    gitUrl: string             # REQUIRED — git repo URL containing the landscape
    ciProfile: string          # REQUIRED — CI profile name from ci.yml
  rest:                        # Option B: Custom REST backend
    url: string                # REQUIRED — base URL of the REST backend
    authTokenEnv: string       # OPTIONAL — env var name containing the auth token

configSchema: object           # OPTIONAL — JSON Schema for user-configurable options
secretsSchema: object          # OPTIONAL — JSON Schema for secret values
detailsSchema: object          # OPTIONAL — JSON Schema for runtime details
planSchema: object             # OPTIONAL — JSON Schema for plan parameters (REST backends)
```

---

## 2. Field Reference

### name

- **Type:** string
- **Required:** yes
- **Pattern:** `^[-a-z0-9_]+$`
- **Constraints:** Lowercase, alphanumeric, hyphens, and underscores only
- **Examples:** `mattermost`, `postgresql`, `redis-cluster`
- **Invalid:** `Mattermost`, `my service`, `My_Provider`

### version

- **Type:** string
- **Required:** yes
- **Format:** `v[0-9]+` — e.g., `v1`, `v2`, `v10`
- **Invalid:** `1.0.0`, `latest`, `v1.0`
- **Note:** This is NOT semver. It's a simple integer version prefixed with `v`.

### author

- **Type:** string
- **Required:** yes
- **Purpose:** Organization or individual shown in the Marketplace

### displayName

- **Type:** string
- **Required:** yes
- **Purpose:** Human-readable name shown in the Marketplace UI
- **Examples:** `Mattermost`, `PostgreSQL 16`, `Redis Cluster`

### iconUrl

- **Type:** string
- **Required:** no
- **Format:** Absolute URL or relative path to an icon image

### category

- **Type:** string
- **Required:** yes
- **Purpose:** Grouping in the Marketplace UI
- **Common values:** `databases`, `messaging`, `monitoring`, `collaboration`, `storage`, `networking`

### description

- **Type:** string (multiline)
- **Required:** yes
- **Format:** Markdown-formatted. Use `|` for multiline in YAML.
- **Example:**
  ```yaml
  description: |
    Open-source team messaging and collaboration platform.
    Supports channels, direct messaging, and file sharing.
  ```

---

## 3. backend.landscape

Defines where the landscape configuration lives and which CI profile to use.

```yaml
backend:
  landscape:
    gitUrl: string             # REQUIRED — git repository URL
    ciProfile: string          # REQUIRED — CI profile name from ci.yml
```

### gitUrl

- **Type:** string
- **Required:** yes
- **Format:** Valid Git URL (HTTPS or SSH)
- **Constraint:** The repository must contain a valid Codesphere landscape with a `ci.yml` file
- **Note:** Git provider permissions must be configured in your Codesphere account
- **Examples:**
  - `https://github.com/your-org/mattermost-landscape`
  - `git@github.com:your-org/redis-landscape.git`

### ciProfile

- **Type:** string
- **Required:** yes
- **Purpose:** References a profile defined in the landscape's `ci.yml`
- **Examples:** `production`, `default`, `staging`

---

## 3b. backend.rest (REST Backend Providers)

Defines a custom REST backend that implements the Codesphere Managed Service Adapter API. Use this instead of `backend.landscape` when your service is provisioned by an external REST API rather than a Codesphere landscape.

```yaml
backend:
  rest:
    url: string                # REQUIRED — base URL of the REST backend
    authTokenEnv: string       # OPTIONAL — env var name holding the Bearer token
```

> **Important:** `backend.landscape` and `backend.rest` are mutually exclusive. Use exactly one.

### url

- **Type:** string
- **Required:** yes
- **Format:** Valid HTTPS URL (HTTP allowed for development only)
- **Purpose:** Base URL where Codesphere sends lifecycle requests
- **Constraint:** Must implement the Managed Service Adapter API (see below)
- **Examples:**
  - `https://my-backend.example.com/postgres`
  - `https://internal-api.corp.net/services/redis`

### authTokenEnv

- **Type:** string
- **Required:** no
- **Purpose:** Name of the environment variable containing the Bearer token sent in the `Authorization` header
- **Default:** If omitted, no authentication header is sent
- **Example:** `BACKEND_AUTH_TOKEN`
- **Note:** The actual token value should be set as an environment variable during registration, never hardcoded in `provider.yml`

### REST Backend API Contract

Your backend must implement these four endpoints relative to the `url`:

#### Create Service — `POST /`

Called when a new service is requested.

| Field | Description |
|-------|-------------|
| **Request Body** | `{ "id": "uuid", "plan": { "parameters": {...} }, "config": {...}, "secrets": {...} }` |
| **Response** | `201 Created` (empty body) |

#### Get Status — `GET /?id=...`

Polled periodically to sync service status. IDs are passed as repeatable query parameters.

| Field | Description |
|-------|-------------|
| **Query Params** | `id` (repeatable, UUID). If omitted, return all known service IDs. |
| **Response** | `200 OK` with a map of ID → status objects containing `plan`, `config`, and `details` |

#### Update Service — `PATCH /{id}`

Called when configuration, plan, or secrets change, or when drift is detected.

| Field | Description |
|-------|-------------|
| **Path Param** | `id` (UUID) |
| **Request Body** | Partial object with only changed fields |
| **Response** | `204 No Content` |

#### Delete Service — `DELETE /{id}`

Called when a user deletes the service.

| Field | Description |
|-------|-------------|
| **Path Param** | `id` (UUID) |
| **Response** | `204 No Content` |

### Security Considerations

- **Network Isolation:** The backend should ideally only be accessible from the Codesphere control plane
- **Authentication:** Use `authTokenEnv` to configure Bearer token authentication
- **Input Validation:** Strictly validate all incoming `config`, `plan`, and `secrets` parameters
- **TLS:** Always use HTTPS in production

---

## 4. configSchema

Defines user-configurable options using [JSON Schema](https://json-schema.org/). These values are passed to the landscape as **environment variables**.

```yaml
configSchema:
  type: object
  properties:
    SITE_NAME:
      type: string
      description: Display name for your instance
    MAX_USERS:
      type: integer
      description: Maximum number of users allowed
      x-update-constraint: increase-only
    DB_ENGINE:
      type: string
      description: Database engine version
      enum: ['17.6', '16.10', '15.14']
      x-update-constraint: immutable
```

### Rules for configSchema

- Must be `type: object` at the top level
- Each property becomes an environment variable in the landscape
- Property names should be `UPPER_SNAKE_CASE` (they map to env vars)
- Use `description` for each property — shown in the Codesphere UI config section
- Values are referenced in ci.yml as: `${{ workspace.env['PROPERTY_NAME'] }}`
- Supported JSON Schema types: `string`, `integer`, `number`, `boolean`
- Supported formats: `int32`, `int64`, `float`, `double`, `byte`, `binary`, `date`, `date-time`, `password`, `uri`, `hostname`
- Use `enum` to constrain allowed values

### x-update-constraint Extension

Restricts how properties can change after initial creation:

| Constraint | Behavior | Applies To |
|------------|----------|------------|
| `increase-only` | New value must be >= current value | Numeric fields only |
| `immutable` | Cannot be changed once set | Any field |

> Update constraints are only enforced when updating an existing service. During initial creation, all values are accepted.

---

## 5. secretsSchema

Defines secret values (passwords, tokens, API keys) using JSON Schema. Secrets are stored in the landscape's **vault**.

```yaml
secretsSchema:
  type: object
  properties:
    ADMIN_PASSWORD:
      type: string
      format: password
    API_KEY:
      type: string
      format: password
```

### Rules for secretsSchema

- Must be `type: object` at the top level
- Use `format: password` for password fields
- **Never provide default values** for secrets — they must always be user-provided
- Secret values are injected into the landscape's vault
- Referenced in ci.yml as: `${{ vault.SECRET_NAME }}`
- Secret names should be `UPPER_SNAKE_CASE`

---

## 6. detailsSchema

Defines runtime details exposed after provisioning. These are read-only values that describe the running service.

```yaml
detailsSchema:
  type: object
  properties:
    hostname:
      type: string
    port:
      type: integer
    status:
      type: object
      properties:
        state:
          type: string
        uptime:
          type: number
      x-endpoint: "https://{{hostname}}:{{port}}/status"
```

### Rules for detailsSchema

- Must be `type: object` at the top level
- Properties describe information visible to the user after the service is running
- Common properties: `hostname`, `port`, `connectionString`, `dashboardUrl`

### x-endpoint Extension

Allows fetching runtime details dynamically from the running service:

- **Format:** URL string with `{{property}}` interpolation using other details fields
- **Method:** Only `GET` requests are supported
- **Response:** Must return JSON matching the property's schema definition
- **Example:** `x-endpoint: "https://{{hostname}}:{{port}}/status"`

---

## 7. planSchema (REST Backend Providers)

Defines the resource plan parameters for REST backend providers. This schema describes what resource options (CPU, memory, storage, etc.) users can select when provisioning a service. Plan parameters are sent to the REST backend in the `plan.parameters` field.

```yaml
planSchema:
  type: object
  properties:
    storage:
      type: integer
      description: Storage size in MB
    cpu:
      type: integer
      description: CPU allocation in tenths
    memory:
      type: integer
      description: Memory allocation in MB
```

### Rules for planSchema

- Must be `type: object` at the top level
- Only relevant for REST backend providers (landscape providers use `plan` IDs instead)
- Properties describe resource parameters sent in `plan.parameters` to the backend
- Use `description` for each property — shown in the Codesphere UI
- Use `x-update-constraint: increase-only` for resources that can only scale up
- Supported JSON Schema types: `string`, `integer`, `number`, `boolean`

---

## 7. Publishing / Registration

Providers are published via the Codesphere Public API. Two methods are available:

### Method 1: Using Git URL (Recommended)

Provide the Git repository URL. Codesphere fetches and validates `provider.yml` automatically.

```bash
curl -X POST "https://codesphere.com/api/managed-services/providers" \
  -H "Authorization: Bearer $CODESPHERE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gitUrl": "https://github.com/your-org/your-landscape",
    "scope": {
      "type": "global"
    }
  }'
```

### Method 2: Using Full Specification

Send the complete provider definition in the request payload (used by `make register`).

### Provider Scopes

| Scope | Description |
|-------|-------------|
| `global` | Available to all teams. Requires cluster admin permissions. |
| `team` | Available only to specified teams. Provide `teamIds` array. |

```json
{
  "scope": { "type": "team", "teamIds": [123, 456] }
}
```

> **Note:** Replace `codesphere.com` with your instance URL if using a self-hosted deployment.

---

## 8. Validation Rules

These rules are checked by `make validate`:

### Required Fields

1. `name` must match `^[-a-z0-9_]+$`
2. `version` must match `^v[0-9]+$`
3. `displayName`, `author`, `category`, `description` must be non-empty
4. Exactly one backend type must be specified: `backend.landscape` or `backend.rest`

#### Landscape Backend (`backend.landscape`)

5. `backend.landscape.gitUrl` must be a valid URL
6. `backend.landscape.ciProfile` must be non-empty

#### REST Backend (`backend.rest`)

5. `backend.rest.url` must be a valid URL
6. `backend.rest.authTokenEnv` if present must be a valid env var name

### Schema Validation

1. `configSchema`, `secretsSchema`, `detailsSchema`, `planSchema` must have `type: object` at top level if present
2. Secret properties should use `format: password`
3. Properties with `x-update-constraint` must use valid constraint values
4. `planSchema` is only valid for REST backend providers

### Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using semver version (`1.0.0`) | Use `v1`, `v2`, etc. |
| Missing backend section | Provide either `backend.landscape` or `backend.rest` |
| Specifying both `backend.landscape` and `backend.rest` | Use exactly one backend type |
| Default values in secretsSchema | Never set defaults for secrets |
| Hardcoding auth tokens in `backend.rest` | Use `authTokenEnv` to reference an env var |
| `x-update-constraint: increase-only` on a string | Only use on numeric fields |
| Uppercase characters in `name` | Use lowercase with hyphens/underscores only |
| Missing `ciProfile` reference (landscape) | Must match a profile in your ci.yml |
| Using HTTP URL for REST backend in production | Always use HTTPS |

---

## 9. Complete Example

See `config/provider.yml.example` for a full working example of a landscape-based provider (Mattermost collaboration platform).

See `config/provider.rest.yml.example` for a full working example of a REST backend provider (PostgreSQL database).
