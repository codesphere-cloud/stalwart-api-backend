---
description: "Schema and rules for ci.yml landscape configuration. Use when creating or editing CI pipeline definitions for Codesphere landscapes."
applyTo: "**/ci.yml, **/ci.*.yml, **/ci.yml.example"
---

# CI Pipeline (ci.yml) Schema Reference

The `ci.yml` is the central Infrastructure as Code (IaC) file that defines how a Codesphere landscape is built and deployed. It specifies the runtime environment, service orchestration, networking, and environment variables for your entire application landscape.

> **CI Profiles:** Each ci.yml file represents a CI Profile. Different profiles (e.g., `ci.yml`, `ci.dev.yml`, `ci.prod.yml`) allow different configurations for different environments. The profile name referenced in `provider.yml` → `backend.landscape.ciProfile` must match.

---

## 1. Top-Level Structure

```yaml
schemaVersion: v0.2             # REQUIRED — always "v0.2"

prepare:                         # OPTIONAL — build/setup stage
  steps: []

run:                             # REQUIRED — service definitions
  <service-name>: { ... }
  <service-name>: { ... }
```

| Section | Purpose |
|---------|---------|
| `schemaVersion` | Schema version identifier. Always `v0.2`. |
| `prepare` | Installs dependencies, builds assets, prepares the shared filesystem. Runs on the Workspace's compute. |
| `run` | Defines the landscape services — Reactives, Managed Containers, and Managed Services. Each runs on its own dedicated resources in parallel. |

> **No separate test stage.** Testing and linting commands should be integrated into the `prepare` steps.

---

## 2. prepare

The prepare stage initializes the shared filesystem before landscape services start. Steps execute sequentially on the Workspace (IDE pod) resources.

```yaml
prepare:
  steps:
    - name: string               # REQUIRED — human-readable step name
      command: string            # REQUIRED — bash command to execute
```

### Rules

- Steps execute **sequentially** in order
- If any step exits non-zero, the prepare stage **fails**
- Commands run as standard bash — anything you'd run in a terminal works
- Changes to `/home/user/app/` persist on the **shared network filesystem**
- Files outside `/home/user/app/` are ephemeral and lost on restart
- The prepare stage only needs to re-run when build steps or dependencies change
- Use [Nix](https://nixos.org/) for reproducible dependency installation

### Example

```yaml
prepare:
  steps:
    - name: Download Application
      command: wget -O app.zip https://example.com/releases/app-1.0.zip && unzip app.zip
    - name: Install Dependencies
      command: nix-env -iA nixpkgs.nodejs nixpkgs.nginx
    - name: Build
      command: cd app && npm install && npm run build
```

---

## 3. run

The run section defines all services in your landscape. Each key is a **service name** and its value is the service configuration. Services start in **parallel** and have **self-healing** (automatic restart on crash).

```yaml
run:
  <service-name>:               # Service name (used in internal networking)
    # --- Runtime type (pick one) ---
    steps: []                    # Codesphere Reactive (default)
    baseImage: string            # Managed Container (custom Docker image)
    provider: {}                 # Managed Service (from marketplace)

    # --- Common fields ---
    plan: integer                # Resource tier ID
    replicas: integer            # Number of instances (default: 1)
    env: {}                      # Environment variables
    network: {}                  # Port and route configuration
    healthEndpoint: string       # Custom health check URL
    mountSubPath: string         # Restrict filesystem mount
```

---

## 4. Codesphere Reactive Services

The default runtime. Containerized environment with shared filesystem, stateful serverless, and millisecond startup.

```yaml
run:
  my-service:
    plan: 21
    replicas: 1
    mountSubPath: my-service-data
    healthEndpoint: http://localhost:3000/health
    steps:
      - name: Start Server
        command: npm start
    env:
      NODE_ENV: production
    network:
      ports:
        - port: 3000
          isPublic: false
      paths:
        - port: 3000
          path: /
```

### Service Fields

#### steps[]

```yaml
steps:
  - name: string               # OPTIONAL — step name
    command: string            # REQUIRED — bash command to run
```

- Commands run **sequentially** at service startup
- The last command should be the long-running process (web server, worker, etc.)
- If the process exits, the platform automatically restarts it (self-healing)

#### plan

- **Type:** integer
- **Required:** yes
- **Purpose:** Resource tier ID determining CPU and memory allocation
- **Examples:** `0` (smallest), `21` (standard), higher values for more resources
- **Tip:** Use smaller plans with "off when unused" for development; larger plans for production

#### replicas

- **Type:** integer
- **Required:** no
- **Default:** `1`
- **Purpose:** Number of service instances for horizontal scaling
- **Note:** The Landscape Router load-balances requests across all replicas automatically

#### mountSubPath

- **Type:** string
- **Required:** no
- **Purpose:** Restricts the service's filesystem mount to a subdirectory of `/home/user/app/`
- **Best practice:** Use unique mount paths per service to avoid concurrent write conflicts
- **Example:** `mountSubPath: uploads` mounts only `/home/user/app/uploads`

#### healthEndpoint

- **Type:** string
- **Required:** no
- **Default:** `http://localhost:3000/`
- **Format:** Full URL with protocol, host, port, and path
- **Purpose:** The Landscape Router pings this endpoint to check service health
- **Examples:**
  - `http://localhost:3000/health`
  - `http://localhost:8080/api/status`

---

## 5. Managed Containers

Bring your own Docker image while Codesphere provides orchestration, networking, and monitoring. Same fields as Reactives plus:

```yaml
run:
  nginx-server:
    baseImage: nginx:1.25-alpine     # REQUIRED — Docker image
    plan: 21
    runAsUser: 1000                  # OPTIONAL — container user ID
    runAsGroup: 1000                 # OPTIONAL — container group ID
    steps:
      - command: nginx -g "daemon off;"
    healthEndpoint: http://localhost:80/
    network:
      ports:
        - port: 80
          isPublic: false
      paths:
        - port: 80
          path: /
    env:
      NGINX_HOST: example.com
```

#### baseImage

- **Type:** string
- **Required:** yes (this is what makes it a Managed Container instead of a Reactive)
- **Format:** Docker image reference `image:tag`
- **Best practice:** Pin a specific tag, never use `latest`
- **Examples:** `nginx:1.25-alpine`, `node:20-slim`, `postgres:16-alpine`

#### runAsUser / runAsGroup

- **Type:** integer
- **Required:** no
- **Purpose:** Set the UID/GID the container process runs as

---

## 6. Managed Services

Pre-configured services from the Codesphere marketplace (databases, caches, message queues). Defined using the `provider` field instead of `steps`.

```yaml
run:
  primary-db:
    provider:
      name: postgres               # REQUIRED — provider name from marketplace
      version: v1                  # REQUIRED — provider version
    plan:
      id: 0                        # REQUIRED — resource plan ID
```

### Provider Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider.name` | string | yes | Provider name as registered in the marketplace |
| `provider.version` | string | yes | Provider version (e.g., `v1`, `v2`) |
| `plan.id` | integer | yes | Resource plan ID for the managed service |

### Managed Service Hostname

Managed services get a deterministic internal hostname:

```
ms-${providerName}-${providerVersion}-${teamId}-${serviceName}
```

All characters are lowercased and non-alphanumeric characters (except `-`) are replaced with `-`.

**Example:** For provider `postgres` version `v1`, team ID `42`, service name `primary-db`:
→ `ms-postgres-v1-42-primary-db`

### Lifecycle

- **Created** when the landscape is deployed
- **Updated** when ci.yml config changes and landscape is re-synced
- **Deleted** when the landscape is deleted (prevents orphan resources)
- Renaming a managed service in ci.yml recreates it — **this can cause data loss**

---

## 7. Network Configuration

### network.ports[]

```yaml
network:
  ports:
    - port: integer              # REQUIRED — container port number
      isPublic: boolean          # OPTIONAL — default: false
```

- `isPublic: false` (recommended) — port is only accessible within the private landscape network
- `isPublic: true` — port gets a direct public URL (not recommended for most services)

### network.paths[]

```yaml
network:
  paths:
    - port: integer              # REQUIRED — which port to route to
      path: string               # REQUIRED — URL path prefix
```

- Configures the **Landscape Router** to map incoming HTTP requests by path prefix
- Multiple services can each claim different path prefixes
- The router load-balances across all replicas of a service automatically

**Example multi-service routing:**

```yaml
run:
  frontend:
    network:
      paths:
        - port: 3000
          path: /
  backend:
    network:
      paths:
        - port: 8080
          path: /api
  websocket:
    network:
      paths:
        - port: 9000
          path: /ws
```

### Public URLs

Services are accessed through:
- **Dev Domain:** `https://[workspace-id]-[port].[datacenter-id].[instance-url]/*`
- **Custom Domain:** Configured in Domain Settings

### Private Networking

Services within a landscape communicate via internal URLs:

```
http://ws-server-[WorkspaceId]-[serviceName]:[port]
```

These URLs are **only resolvable within the landscape's private network** — not from the public internet or a user's browser.

---

## 8. Environment Variables

```yaml
env:
  KEY: value                           # Plain text value
  SECRET: ${{ vault.secretName }}      # From vault (encrypted)
  CONFIG: ${{ workspace.env['KEY'] }}  # From workspace config
  WS_ID: ${{ workspace.id }}          # Workspace ID
  TEAM: ${{ team.id }}                # Team ID
```

### Template Syntax

| Template | Description |
|----------|-------------|
| `${{ vault.NAME }}` | Secret from the Codesphere vault (encrypted, injected at runtime) |
| `${{ workspace.env['KEY'] }}` | Global workspace environment variable (from `configSchema` values) |
| `${{ workspace.id }}` | Resolves to the Workspace ID |
| `${{ team.id }}` | Resolves to the Team ID |

### Rules

- **Secrets** must use `${{ vault.NAME }}` — never hardcode sensitive values
- Vault secrets are stored encrypted and only injected at runtime
- `workspace.env['KEY']` maps to values from the provider's `configSchema`
- `vault.NAME` maps to values from the provider's `secretsSchema`

---

## 9. Filesystem

- **Persistent:** Files in `/home/user/app/` are stored on the shared network filesystem
- **Ephemeral:** Files outside `/home/user/app/` exist only on the local pod and are lost on restart
- **Shared:** All Reactive services (including the Workspace) share the same network filesystem
- **Storage:** Total storage is defined at the Workspace level
- **Best practice:** Run each service in its own directory (via `mountSubPath`) to avoid concurrent write conflicts

---

## 10. Complete Example (Landscape with Reactive + Managed Service)

```yaml
schemaVersion: v0.2

prepare:
  steps:
    - name: Download Application
      command: wget -O app.zip https://download.example.com/releases/app-1.0.zip
    - name: Install Dependencies
      command: nix-env -iA nixpkgs.php83 nixpkgs.nginx

run:
  # Codesphere Reactive — the main application
  webapp:
    plan: 21
    replicas: 2
    healthEndpoint: http://localhost:3000/health
    steps:
      - name: Start Application
        command: |
          php-fpm -y ./config/php-fpm.conf
          nginx -c $(pwd)/config/nginx.conf
    env:
      DB_HOST: ms-postgres-v1-42-primary-db
      DB_PASSWORD: ${{ vault.DB_PASSWORD }}
      SITE_NAME: ${{ workspace.env['SITE_NAME'] }}
    network:
      ports:
        - port: 3000
          isPublic: false
      paths:
        - port: 3000
          path: /

  # Managed Service — PostgreSQL database
  primary-db:
    provider:
      name: postgres
      version: v1
    plan:
      id: 0
```

---

## 11. Validation Rules

These rules are checked by `make validate`:

1. `schemaVersion` must be `v0.2`
2. `run` section must be present with at least one service
3. Each service must have either `steps`, `baseImage` + `steps`, or `provider`
4. Service names should be lowercase, alphanumeric with hyphens
5. Template variables must use valid syntax: `${{ vault.X }}`, `${{ workspace.env['X'] }}`

### Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing `schemaVersion` | Add `schemaVersion: v0.2` at the top |
| Using a separate `test` stage | Integrate tests into `prepare` steps |
| Writing files outside `/home/user/app/` | Only `/home/user/app/` is persistent |
| Hardcoding secrets in `env` | Use `${{ vault.SECRET_NAME }}` |
| Using `isPublic: true` for internal services | Keep internal services private, use `paths` for routing |
| Concurrent writes to same files from multiple services | Use `mountSubPath` to isolate service filesystems |
| Missing `plan` on a service | Every Reactive/Container service needs a `plan` |
| Using `latest` tag for `baseImage` | Pin a specific version tag |