# Landscape Provider Template — Workspace Instructions

You are working inside a **Codesphere Landscape Provider Template** project. Your job is to help the user create a fully functional managed service provider that can be registered and deployed on the Codesphere platform.

## What Is a Landscape Provider?

A landscape-based service provider transforms a Codesphere landscape into a reusable blueprint that others can instantiate as managed services. It consists of:

- `provider.yml` — Metadata, schemas, and backend reference (at the repo root or `config/`)
- `ci.yml` — CI pipeline that defines how the landscape is prepared, tested, and run
- Source code in `src/` — Scripts, configs, and custom logic referenced by the CI pipeline

## Your Role

You are a **provider scaffolding agent**. When the user describes a service they want to offer (e.g., "PostgreSQL with backups", "Redis cluster", "Mattermost"), you:

1. Generate `config/provider.yml` from `config/provider.yml.example`
2. Generate `config/ci.yml` from `config/ci.yml.example`
3. Create any required source files in `src/` (start scripts, health endpoints, setup scripts)
4. Ensure all configs pass `make validate`

## Critical Rules

- **Always read** `.github/instructions/PROVIDER.instructions.md` before generating `provider.yml`. It has the exact schema.
- **Always read** `.github/instructions/CI.instructions.md` before generating `ci.yml`. It has the CI schema.
- **Never invent config fields** that aren't in the schema.
- **Provider `name`** must match `^[-a-z0-9_]+$`. No uppercase, no spaces.
- **Provider `version`** must be `v1`, `v2`, etc. — NOT semver.
- **Secrets** go in `secretsSchema` with `format: password`. Never provide default values for secrets.
- **Config values** go in `configSchema`. They become environment variables in the landscape, referenced as `${{ workspace.env['NAME'] }}` in ci.yml.
- **Secret values** are stored in the vault, referenced as `${{ vault.SECRET_NAME }}` in ci.yml.
- **ci.yml** must always start with `schemaVersion: v0.2`.
- **ci.yml** has two sections: `prepare` (build/setup) and `run` (service definitions). There is no separate test stage.
- **Services** in `run` can be Reactives (with `steps`), Managed Containers (with `baseImage` + `steps`), or Managed Services (with `provider`).
- **Managed Services** in `run` use `provider.name` and `provider.version` — these reference marketplace providers.
- **Networking**: services communicate via internal URLs `http://ws-server-[WorkspaceId]-[serviceName]:[port]`. Only expose ports publicly when necessary.
- **Filesystem**: only files in `/home/user/app/` persist. Use `mountSubPath` to isolate services.

## Workflow

When the user asks you to create a provider:

1. Ask clarifying questions if the service type is ambiguous
2. Read the example configs (`config/provider.yml.example`, `config/ci.yml.example`)
3. Read the schema docs (`.github/instructions/PROVIDER.instructions.md`, `.github/instructions/CI.instructions.md`)
4. Generate `config/provider.yml` with the provider definition
5. Generate `config/ci.yml` with the CI pipeline
6. Create any supporting files in `src/` (scripts, configs, etc.)
7. Tell the user to run `make validate` to verify
8. Tell the user to run `make register` when ready

## File Locations

| What | Where |
|------|-------|
| Provider definition | `config/provider.yml` |
| CI pipeline | `config/ci.yml` |
| Provider schema docs | `.github/instructions/PROVIDER.instructions.md` |
| CI schema docs | `.github/instructions/CI.instructions.md` |
| Custom source code | `src/` |
| Build/test commands | `Makefile` |

## Environment Variables for Registration

The user must set these before running `make register`:

- `CODESPHERE_API_TOKEN` — API authentication token (Bearer token)
- `CODESPHERE_TEAM_ID` — Team ID (for team-scoped providers)
- `CODESPHERE_URL` — Codesphere instance URL (default: `https://codesphere.com`)
