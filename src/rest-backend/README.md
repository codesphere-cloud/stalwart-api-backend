# Example REST Backend

A minimal Node.js implementation of the [Codesphere Managed Service Adapter API](../../.github/instructions/PROVIDER.instructions.md).

This backend provides the four required endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` | Create a new service |
| `GET` | `/?id=...` | Get status of services (or list all IDs) |
| `PATCH` | `/:id` | Update an existing service |
| `DELETE` | `/:id` | Delete a service |

## Quick Start

```bash
cd src/rest-backend
npm install
npm start
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `8080` | Port to listen on |
| `AUTH_TOKEN` | _(none)_ | Bearer token for authentication (recommended) |

## Customization

This example uses an in-memory store. Replace the `TODO` comments in `server.js` with your actual infrastructure provisioning logic (e.g., cloud API calls, Kubernetes operations, database management).
