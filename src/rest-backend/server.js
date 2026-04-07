/**
 * Example REST backend implementing the Codesphere Managed Service Adapter API.
 *
 * Endpoints:
 *   POST   /           — Create a new service
 *   GET    /?id=...    — Get status of services (or list all IDs)
 *   PATCH  /:id        — Update an existing service
 *   DELETE /:id        — Delete a service
 *
 * This is a minimal in-memory example. Replace the store and provisioning
 * logic with your actual infrastructure calls (cloud APIs, Kubernetes, etc.).
 */

const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ── Auth middleware ────────────────────────────────────────────────
if (AUTH_TOKEN) {
  app.use((req, res, next) => {
    const header = req.headers.authorization;
    if (!header || header !== `Bearer ${AUTH_TOKEN}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });
}

// ── In-memory store (replace with your database / infrastructure) ─
const services = new Map();

// ── UUID validation ───────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

// ── POST / — Create Service ───────────────────────────────────────
app.post('/', (req, res) => {
  const { id, plan, config, secrets } = req.body;

  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid service id (UUID required)' });
  }

  if (services.has(id)) {
    return res.status(409).json({ error: 'Service already exists' });
  }

  // TODO: Replace with actual provisioning logic
  services.set(id, {
    plan: plan || {},
    config: config || {},
    secrets: secrets || {},
    details: {
      hostname: `db-${id.slice(0, 8)}.internal`,
      port: 5432,
      dsn: `postgres://user:***@db-${id.slice(0, 8)}.internal:5432/${config?.databaseName || 'default'}`,
      ready: true,
    },
    createdAt: new Date().toISOString(),
  });

  res.status(201).end();
});

// ── GET / — Get Status ────────────────────────────────────────────
app.get('/', (req, res) => {
  // id can appear multiple times: ?id=uuid1&id=uuid2
  let ids = req.query.id;

  // No IDs provided → return all known service IDs
  if (!ids) {
    return res.json(Array.from(services.keys()));
  }

  // Normalize to array
  if (!Array.isArray(ids)) {
    ids = [ids];
  }

  const result = {};
  for (const id of ids) {
    if (!isValidUUID(id)) continue;
    const svc = services.get(id);
    if (svc) {
      result[id] = {
        plan: svc.plan,
        config: svc.config,
        details: svc.details,
      };
    }
  }

  res.json(result);
});

// ── PATCH /:id — Update Service ───────────────────────────────────
app.patch('/:id', (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid service id' });
  }

  const svc = services.get(id);
  if (!svc) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const { plan, config, secrets } = req.body;

  // TODO: Replace with actual update/scaling logic
  if (plan) {
    svc.plan = { ...svc.plan, ...plan };
  }
  if (config) {
    svc.config = { ...svc.config, ...config };
  }
  if (secrets) {
    svc.secrets = { ...svc.secrets, ...secrets };
  }

  res.status(204).end();
});

// ── DELETE /:id — Delete Service ──────────────────────────────────
app.delete('/:id', (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid service id' });
  }

  if (!services.has(id)) {
    return res.status(404).json({ error: 'Service not found' });
  }

  // TODO: Replace with actual de-provisioning logic
  services.delete(id);

  res.status(204).end();
});

// ── Start server ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`REST backend listening on port ${PORT}`);
  if (AUTH_TOKEN) {
    console.log('Authentication enabled');
  } else {
    console.log('WARNING: No AUTH_TOKEN set — authentication disabled');
  }
});
