# Codesphere Landscape Provider Template

A template repository for creating **managed service providers** on the Codesphere platform. Clone this repo, describe what service you want to offer, and let the AI agent scaffold the entire provider for you — then register it with a single `make` command.

---

## What Is a Landscape Provider?

A **landscape-based service provider** transforms a Codesphere landscape into a reusable blueprint that others can instantiate as managed services. Each provider defines:

- **Metadata** — name, version, display name, category, description, icon
- **Backend** — Git repository URL and CI profile reference
- **Configuration schemas** — what users can configure (`configSchema`), what secrets they must provide (`secretsSchema`), and what runtime details are exposed (`detailsSchema`)

When registered, your provider appears in the Codesphere Marketplace and can be deployed by any team with access.

---

## Quick Start

### Prerequisites

| Requirement | Why |
|-------------|-----|
| [Codesphere account](https://codesphere.com) | To register and deploy providers |
| `CODESPHERE_API_TOKEN` | API Bearer token for authentication (set as env var) |
| `CODESPHERE_TEAM_ID` | Your team ID — for team-scoped providers (set as env var) |
| `CODESPHERE_URL` | Codesphere instance URL (default: `https://codesphere.com`) |
| `make` | Build automation |
| `yq` (optional) | YAML validation in scripts |
| Git provider configured | Git permissions in your Codesphere account settings |

### 1. Clone this template

```bash
git clone https://github.com/codesphere-cloud/ms-landscape-template.git my-provider
cd my-provider
```

### 2. Tell the agent what you want

Open the project in VS Code with GitHub Copilot enabled, then prompt:

> "I want to create a landscape provider for **PostgreSQL 16** with automated backups and a health check endpoint."

The agent will:
- Read the instructions in `.github/copilot-instructions.md`
- Follow the detailed schema in `.github/instructions/PROVIDER.instructions.md` and `.github/instructions/CI.instructions.md`
- Generate `config/provider.yml` and `config/ci.yml` from the examples
- Scaffold any required source code in `src/`

### 3. Validate locally

```bash
make validate
```

This checks your `provider.yml` and `ci.yml` against the expected schema and catches common mistakes before registration.

### 4. Register the provider

```bash
make register
```

This calls the Codesphere API to register your provider with your team.

### 5. Test the provider

```bash
make test
```

Deploys a test workspace with your provider and runs smoke tests.

---

## Project Structure

```
ms-landscape-template/
├── README.md                              # This file
├── Makefile                               # validate, register, test commands
│
├── .github/
│   ├── copilot-instructions.md            # Agent persona & workflow (auto-loaded)
│   └── instructions/
│       ├── PROVIDER.instructions.md       # Provider definition schema & rules
│       └── CI.instructions.md             # CI pipeline schema & rules
│
├── config/
│   ├── provider.yml.example               # Example provider definition
│   └── ci.yml.example                     # Example CI pipeline config
│
├── scripts/
│   ├── validate.sh                        # Validate config files locally
│   ├── register.sh                        # Register provider via API
│   └── test-provider.sh                   # Smoke-test a deployed provider
│
└── src/                                   # Provider source code (agent-generated)
    └── .gitkeep
```

### Key Files

| File | Purpose |
|------|---------|
| `config/provider.yml` | Provider definition: metadata, backend, config/secrets/details schemas |
| `config/ci.yml` | CI pipeline: prepare, test, and run stages for the landscape |
| `.github/copilot-instructions.md` | Tells the AI agent *what this project is* and *how to work in it* |
| `.github/instructions/PROVIDER.instructions.md` | Detailed schema reference for `provider.yml` |
| `.github/instructions/CI.instructions.md` | Detailed schema reference for `ci.yml` |

---

## Configuration Reference

### provider.yml

The provider definition file. Describes your managed service metadata and configuration schemas:

```yaml
name: mattermost                # Unique name (lowercase, hyphens, underscores)
version: v1                     # Version: v1, v2, etc. (NOT semver)
author: Your Team
displayName: Mattermost         # Human-readable name for the Marketplace
category: collaboration         # e.g., databases, messaging, monitoring
description: |                  # Markdown description
  Open-source team messaging and collaboration platform.

backend:
  landscape:
    gitUrl: https://github.com/your-org/mattermost-landscape
    ciProfile: production       # CI profile name from ci.yml

configSchema:                   # User-configurable options → env vars
  type: object
  properties:
    SITE_NAME:
      type: string
      description: Display name for your instance
    MAX_USERS:
      type: integer
      description: Maximum number of users
      x-update-constraint: increase-only

secretsSchema:                  # Secrets → stored in vault
  type: object
  properties:
    ADMIN_PASSWORD:
      type: string
      format: password

detailsSchema:                  # Runtime details exposed after provisioning
  type: object
  properties:
    hostname:
      type: string
    port:
      type: integer
```

**Key concepts:**
- Config values are referenced in ci.yml as `${{ workspace.env['NAME'] }}`
- Secrets are referenced in ci.yml as `${{ vault.SECRET_NAME }}`
- Use `x-update-constraint: increase-only` or `immutable` to restrict post-creation updates
- Use `x-endpoint` in detailsSchema to fetch live data from the running service

### ci.yml

The CI pipeline definition. Defines how to prepare the environment and orchestrate landscape services:

```yaml
schemaVersion: v0.2

prepare:                          # Build stage — runs on Workspace compute
  steps:
    - name: Install Dependencies
      command: nix-env -iA nixpkgs.nodejs

run:                              # Landscape services — run in parallel
  webapp:                         # Codesphere Reactive
    plan: 21
    steps:
      - command: npm start
    env:
      DB_HOST: ms-postgres-v1-42-primary-db
      SECRET: ${{ vault.MY_SECRET }}
    network:
      ports:
        - port: 3000
          isPublic: false
      paths:
        - port: 3000
          path: /

  primary-db:                     # Managed Service from marketplace
    provider:
      name: postgres
      version: v1
    plan:
      id: 0
```

**Key concepts:**
- `prepare` installs deps and builds assets on the shared filesystem (`/home/user/app/`)
- `run` defines services: Reactives (`steps`), Managed Containers (`baseImage`), or Managed Services (`provider`)
- Services communicate via private networking: `http://ws-server-[WorkspaceId]-[serviceName]:[port]`
- Environment templates: `${{ vault.NAME }}`, `${{ workspace.env['KEY'] }}`, `${{ workspace.id }}`, `${{ team.id }}`

> Full ci.yml schema documented in `.github/instructions/CI.instructions.md`

---

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make validate` | Validate `provider.yml` and `ci.yml` syntax and schema |
| `make register` | Register the provider with Codesphere (requires `CODESPHERE_API_TOKEN`) |
| `make test` | Deploy a test instance and run smoke tests |
| `make clean` | Remove generated files |
| `make help` | Show all available commands |

---

## Development Workflow

### Using the AI Agent

This template is designed to be **agent-first**. The recommended workflow:

1. **Describe your service** — Tell the agent what managed service you want to create
2. **Review generated configs** — The agent creates `provider.yml` and `ci.yml`
3. **Add custom logic** — If your service needs setup scripts or custom health checks, add them to `src/`
4. **Validate** — Run `make validate` to catch issues
5. **Register** — Run `make register` to publish to Codesphere
6. **Test** — Run `make test` to verify end-to-end

### Manual Workflow

If you prefer to work without the agent:

1. Copy `config/provider.yml.example` → `config/provider.yml`
2. Copy `config/ci.yml.example` → `config/ci.yml`
3. Edit both files following the schema in `.github/instructions/PROVIDER.instructions.md`
4. Add any source code to `src/`
5. Run `make validate && make register`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `make validate` fails with schema errors | Check your YAML against the schema in `PROVIDER.instructions.md` |
| `make register` returns 401 | Verify `CODESPHERE_API_TOKEN` is set and valid |
| `make register` returns 409 | Provider name/version already registered — bump version or use a different name |
| Agent doesn't follow the template | Ensure `.github/copilot-instructions.md` exists and VS Code is using the workspace |
| `version` validation fails | Use `v1`, `v2` format — NOT semver like `1.0.0` |

---

## Contributing

1. Fork this repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

MIT
