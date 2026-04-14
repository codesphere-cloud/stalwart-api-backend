# Stalwart Managed Service Provider — Workshop Template

A Codesphere managed service provider that wraps [Stalwart Mail Server](https://stalw.art/) as a self-service email offering. Users can provision individual mailboxes (with IMAP, SMTP, JMAP, and webmail access) through the Codesphere marketplace.

**This is the workshop starting point.** The scaffolding is in place — your job is to implement the REST backend in `server.js`. A complete reference solution is available on the `solution` branch.

## How It Works

A single shared Stalwart instance hosts many mail accounts. When a user books the service through Codesphere, the REST backend creates a new mail account ("logical tenant") on that shared server. When they delete the service, the account is removed.

```
Codesphere Platform  <-->  REST Backend (this repo)  -->  Stalwart Mail Server
  (reconcile loop)         POST/GET/PATCH/DELETE           (shared instance)
```

## Repository Structure

```
├── server.js                       # REST backend — implement the TODOs here
├── package.json
├── ci.stalwart.yml                 # CI pipeline for the Stalwart Mail Server
├── ci.stalwart-provider.yml        # CI pipeline for the REST provider backend
├── provider.yml                    # Marketplace service definition
├── docker-compose.local.yml        # Local Stalwart for development (optional)
└── TUTORIAL_WORKSHOP.md            # Step-by-step workshop guide
```

## Getting Started

1. Create a Codesphere workspace from this repository
2. Follow [TUTORIAL_WORKSHOP.md](TUTORIAL_WORKSHOP.md) — it walks you through implementing each endpoint
3. The `ci.stalwart-provider.yml` pipeline handles install and startup automatically
4. Once your backend works, link the custom domain and book a service through the marketplace
