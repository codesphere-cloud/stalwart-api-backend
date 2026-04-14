/**
 * Stalwart Mailbox REST Backend
 *
 * Implements the Codesphere Managed Service Adapter API to provision
 * email accounts on a Stalwart Mail Server instance.
 *
 * Endpoints:
 *   POST   /           — Create a new mailbox user
 *   GET    /?id=...    — Get status of mailbox services
 *   PATCH  /:id        — Update an existing mailbox user
 *   DELETE /:id        — Delete a mailbox user
 *
 * The Stalwart API helpers (stalwartRequest, ensureDomain, buildDetails, etc.)
 * are provided in stalwart.js — your job is to implement the CRUD endpoints below.
 *
 * A complete reference solution is available in server_solution.js
 * (or on the `solution` branch).
 */

const express = require('express');
const {
  stalwartRequest,
  parseStalwartResponse,
  ensureDomain,
  buildDetails,
} = require('./stalwart');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const STALWART_DEFAULT_DOMAIN = process.env.STALWART_MAIL_DOMAIN || '';

// ── In-memory store (maps Codesphere service ID → service data) ───
const services = new Map();

// ── Validation helpers ───────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

const EMAIL_PREFIX_RE = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i;

function isValidEmailPrefix(prefix) {
  return typeof prefix === 'string' && prefix.length >= 1 && prefix.length <= 64 && EMAIL_PREFIX_RE.test(prefix);
}

// ── POST / — Create Mailbox ──────────────────────────────────────
app.post('/', async (req, res) => {
  const { id, config, secrets, plan } = req.body;

  // Validate input
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid service id (UUID required)' });
  }
  if (services.has(id)) {
    return res.status(201).end(); // Idempotent
  }

  const emailPrefix = config?.EMAIL_PREFIX;
  if (!emailPrefix || !isValidEmailPrefix(emailPrefix)) {
    return res.status(400).json({ error: 'Missing or invalid EMAIL_PREFIX in config' });
  }
  const password = secrets?.MAIL_PASSWORD;
  if (!password) {
    return res.status(400).json({ error: 'Missing MAIL_PASSWORD in secrets' });
  }
  const mailDomain = (config?.MAIL_DOMAIN || STALWART_DEFAULT_DOMAIN || '').toLowerCase();
  if (!mailDomain) {
    return res.status(400).json({ error: 'Missing MAIL_DOMAIN in config and no default domain configured' });
  }

  const username = emailPrefix.toLowerCase();
  const email = `${username}@${mailDomain}`;

  // TODO: Implement the create logic:
  //
  // 1. Ensure the domain exists on Stalwart:
  //      await ensureDomain(mailDomain);
  //
  // 2. Create the user principal on Stalwart via POST /api/principal with body:
  //      { type: "individual", name: username, secrets: [password],
  //        emails: [email], description: config.DISPLAY_NAME || username,
  //        quota: (config.QUOTA_MB || 0) * 1024 * 1024,
  //        roles: ["user"], lists: [], memberOf: [], members: [],
  //        enabledPermissions: [], disabledPermissions: [], urls: [], externalMembers: [] }
  //    Use stalwartRequest('POST', '/api/principal', body) and parseStalwartResponse().
  //    Handle "alreadyExists" gracefully (that means the user exists — adopt it).
  //
  // 3. Build connection details:
  //      const details = await buildDetails(username, email, mailDomain, password);
  //
  // 4. Store in the services Map:
  //      services.set(id, { username, email, mailDomain, plan, config, details });
  //
  // 5. Return 201:
  //      res.status(201).end();
  //
  // Wrap everything in try/catch and return 502 on Stalwart errors.
  //
  // Hint: See Part 3.3 C in the workshop tutorial.

  res.status(501).json({ error: 'POST / not implemented yet' });
});

// ── GET / — Get Status ───────────────────────────────────────────
app.get('/', (req, res) => {
  let ids = req.query.id;

  // No IDs? Return list of all known service IDs
  if (!ids) {
    return res.json(Array.from(services.keys()));
  }

  if (!Array.isArray(ids)) {
    ids = [ids];
  }

  // TODO: For each requested ID, look it up in the services Map.
  // Build a result object: { [id]: { plan, config, details } }
  // Return it as JSON.
  //
  // Hint: See Part 3.3 D in the workshop tutorial.

  res.json({});
});

// ── PATCH /:id — Update Mailbox ──────────────────────────────────
app.patch('/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid service id' });
  }

  const svc = services.get(id);
  if (!svc) {
    return res.status(404).json({ error: 'Service not found' });
  }

  const { config, secrets, plan } = req.body;

  // TODO: Implement the update logic:
  //
  // 1. Build an actions array for Stalwart's PATCH format:
  //      const actions = [];
  //      if (config?.DISPLAY_NAME)
  //        actions.push({ action: 'set', field: 'description', value: config.DISPLAY_NAME });
  //      if (config?.QUOTA_MB !== undefined)
  //        actions.push({ action: 'set', field: 'quota', value: config.QUOTA_MB * 1024 * 1024 });
  //      if (secrets?.MAIL_PASSWORD)
  //        actions.push({ action: 'set', field: 'secrets', value: [secrets.MAIL_PASSWORD] });
  //
  // 2. If there are actions, send them:
  //      stalwartRequest('PATCH', `/api/principal/${encodeURIComponent(svc.username)}`, actions)
  //    IMPORTANT: Use the username string in the path, NOT a numeric ID!
  //
  // 3. Update the local service state (svc.config, svc.plan).
  //
  // 4. Return 204 No Content.
  //
  // Hint: See Part 3.3 E in the workshop tutorial.

  res.status(501).json({ error: 'PATCH not implemented yet' });
});

// ── DELETE /:id — Delete Mailbox ─────────────────────────────────
app.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid service id' });
  }

  const svc = services.get(id);
  if (!svc) {
    return res.status(404).json({ error: 'Service not found' });
  }

  // TODO: Implement the delete logic:
  //
  // 1. Delete the user on Stalwart:
  //      stalwartRequest('DELETE', `/api/principal/${encodeURIComponent(svc.username)}`)
  //    Ignore "notFound" errors (user may already be gone).
  //
  // 2. Remove from the services Map:
  //      services.delete(id);
  //
  // 3. Return 204 No Content.
  //
  // Hint: See Part 3.3 F in the workshop tutorial.

  res.status(501).json({ error: 'DELETE not implemented yet' });
});

// ── Start server ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Stalwart mailbox backend listening on port ${PORT}`);
  console.log(`Stalwart API: ${process.env.STALWART_API_URL}`);
  console.log(`Mail domain: ${STALWART_DEFAULT_DOMAIN || '(per-service)'}`);
});
