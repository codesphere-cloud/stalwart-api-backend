/**
 * Stalwart Mailbox REST Backend — REFERENCE SOLUTION
 *
 * This is the complete working implementation.
 * Compare with server.js (the template with TODOs) to check your work.
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

  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Missing or invalid service id (UUID required)' });
  }
  if (services.has(id)) {
    return res.status(201).end();
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
  const displayName = config?.DISPLAY_NAME || username;
  const quotaMB = config?.QUOTA_MB || 0;

  try {
    await ensureDomain(mailDomain);

    const response = await stalwartRequest('POST', '/api/principal', {
      type: 'individual',
      name: username,
      secrets: [password],
      emails: [email],
      description: displayName,
      quota: quotaMB > 0 ? quotaMB * 1024 * 1024 : 0,
      roles: ['user'],
      lists: [],
      memberOf: [],
      members: [],
      enabledPermissions: [],
      disabledPermissions: [],
      urls: [],
      externalMembers: [],
    });

    const result = await parseStalwartResponse(response);
    if (!result.ok) {
      if (result.error && (result.error.includes('alreadyExists') || result.error.includes('AlreadyExists'))) {
        console.log(`User ${username} already exists in Stalwart, adopting for service ${id}`);
      } else {
        console.error(`Stalwart create failed: ${result.error}`);
        return res.status(502).json({ error: 'Failed to create mailbox on Stalwart', detail: result.error });
      }
    }

    const details = await buildDetails(username, email, mailDomain, password);

    services.set(id, {
      username,
      email,
      mailDomain,
      plan: plan || { id: 0, parameters: {} },
      config: config || {},
      details,
    });

    res.status(201).end();
  } catch (err) {
    console.error('Stalwart API error:', err.message);
    return res.status(502).json({ error: 'Cannot reach Stalwart API', detail: err.message });
  }
});

// ── GET / — Get Status ───────────────────────────────────────────
app.get('/', (req, res) => {
  let ids = req.query.id;

  if (!ids) {
    return res.json(Array.from(services.keys()));
  }

  if (!Array.isArray(ids)) {
    ids = [ids];
  }

  const result = {};
  for (const id of ids) {
    if (!isValidUUID(id)) continue;
    const svc = services.get(id);
    if (svc) {
      result[id] = {
        plan: svc.plan || { id: 0, parameters: {} },
        config: svc.config,
        details: svc.details,
      };
    }
  }

  res.json(result);
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
  const actions = [];

  if (plan) {
    svc.plan = plan;
  }

  if (config?.DISPLAY_NAME) {
    actions.push({ action: 'set', field: 'description', value: config.DISPLAY_NAME });
    svc.config.DISPLAY_NAME = config.DISPLAY_NAME;
  }

  if (config?.QUOTA_MB !== undefined) {
    const quotaMB = config.QUOTA_MB;
    actions.push({ action: 'set', field: 'quota', value: quotaMB > 0 ? quotaMB * 1024 * 1024 : 0 });
    svc.config.QUOTA_MB = quotaMB;
  }

  if (secrets?.MAIL_PASSWORD) {
    actions.push({ action: 'set', field: 'secrets', value: [secrets.MAIL_PASSWORD] });
  }

  if (actions.length > 0) {
    try {
      const response = await stalwartRequest('PATCH', `/api/principal/${encodeURIComponent(svc.username)}`, actions);
      const result = await parseStalwartResponse(response);

      if (!result.ok) {
        console.error(`Stalwart update failed: ${result.error}`);
        return res.status(502).json({ error: 'Failed to update mailbox on Stalwart', detail: result.error });
      }
    } catch (err) {
      console.error('Stalwart API error:', err.message);
      return res.status(502).json({ error: 'Cannot reach Stalwart API', detail: err.message });
    }
  }

  res.status(204).end();
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

  try {
    const response = await stalwartRequest('DELETE', `/api/principal/${encodeURIComponent(svc.username)}`);
    const result = await parseStalwartResponse(response);

    if (!result.ok && !result.error.startsWith('notFound')) {
      console.error(`Stalwart delete failed: ${result.error}`);
      return res.status(502).json({ error: 'Failed to delete mailbox on Stalwart', detail: result.error });
    }
  } catch (err) {
    console.error('Stalwart API error:', err.message);
    return res.status(502).json({ error: 'Cannot reach Stalwart API', detail: err.message });
  }

  services.delete(id);
  res.status(204).end();
});

// ── Start server ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Stalwart mailbox backend listening on port ${PORT}`);
  console.log(`Stalwart API: ${process.env.STALWART_API_URL}`);
  console.log(`Mail domain: ${STALWART_DEFAULT_DOMAIN || '(per-service)'}`);
});
