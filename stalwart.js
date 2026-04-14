/**
 * Stalwart Mail Server — API helpers
 *
 * Provides functions for interacting with the Stalwart admin API,
 * domain management, DNS record retrieval, and JMAP session discovery.
 *
 * Used by server.js to translate Codesphere managed service operations
 * into Stalwart API calls.
 */

// ── Configuration (read from environment) ────────────────────────
const STALWART_API_URL = process.env.STALWART_API_URL;
const STALWART_ADMIN_TOKEN = process.env.STALWART_ADMIN_TOKEN;
const STALWART_IMAP_HOST = process.env.STALWART_IMAP_HOST;
const STALWART_SMTP_HOST = process.env.STALWART_SMTP_HOST;
const STALWART_IMAP_PORT = parseInt(process.env.STALWART_IMAP_PORT || '993', 10);
const STALWART_SMTP_PORT = parseInt(process.env.STALWART_SMTP_PORT || '587', 10);
const STALWART_JMAP_URL = process.env.STALWART_JMAP_URL || (STALWART_API_URL ? `${STALWART_API_URL}/jmap` : '');
const STALWART_WEBMAIL_URL = process.env.STALWART_WEBMAIL_URL || (STALWART_API_URL ? `${STALWART_API_URL}/login` : '');

// ── Stalwart API request helper ──────────────────────────────────

/**
 * Make an authenticated HTTP request to the Stalwart admin API.
 * Auto-detects Basic vs Bearer auth based on whether the token contains ':'.
 */
async function stalwartRequest(method, path, body) {
  const url = `${STALWART_API_URL}${path}`;
  const options = {
    method,
    headers: {
      'Authorization': STALWART_ADMIN_TOKEN.includes(':')
        ? `Basic ${Buffer.from(STALWART_ADMIN_TOKEN).toString('base64')}`
        : `Bearer ${STALWART_ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  return fetch(url, options);
}

/**
 * Parse a Stalwart API response.
 *
 * IMPORTANT: Stalwart returns HTTP 200 for everything, including errors!
 *   Success: {"data": ...}
 *   Error:   {"error": "notFound", "item": "alice"}
 *
 * Returns { ok: true, data: ... } or { ok: false, error: '...' }
 */
async function parseStalwartResponse(response) {
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `HTTP ${response.status}: ${text}` };
  }
  const json = await response.json();
  if (json.error) {
    return { ok: false, error: `${json.error}: ${json.details || json.item || ''}` };
  }
  return { ok: true, data: json.data };
}

// ── Domain management (idempotent) ───────────────────────────────

const ensuredDomains = new Set();

/**
 * Ensure a mail domain exists as a Stalwart principal.
 * Domains must exist before creating users on that domain.
 * Results are cached — safe to call repeatedly for the same domain.
 */
async function ensureDomain(domain) {
  if (ensuredDomains.has(domain)) return;
  const resp = await stalwartRequest('POST', '/api/principal', {
    type: 'domain',
    name: domain,
    description: `Mail domain ${domain}`,
  });
  const result = await parseStalwartResponse(resp);
  if (result.ok || (result.error && (result.error.includes('alreadyExists') || result.error.includes('AlreadyExists')))) {
    ensuredDomains.add(domain);
    console.log(`Domain ${domain} ensured.`);
  } else {
    console.error(`Failed to ensure domain ${domain}:`, result.error);
    throw new Error(`Failed to ensure domain: ${result.error}`);
  }
}

// ── DNS records ──────────────────────────────────────────────────

/**
 * Fetch DNS records (MX, SPF, DKIM, DMARC) from Stalwart for a domain.
 * Returns an array of record objects, or [] on failure.
 */
async function fetchDnsRecords(domain) {
  try {
    const resp = await stalwartRequest('GET', `/api/dns/records/${encodeURIComponent(domain)}`);
    const result = await parseStalwartResponse(resp);
    if (!result.ok) {
      console.error(`Failed to fetch DNS records for ${domain}:`, result.error);
      return [];
    }
    return result.data || [];
  } catch (err) {
    console.error(`DNS record fetch error for ${domain}:`, err.message);
    return [];
  }
}

/**
 * Format DNS records into a human-readable multi-line string.
 */
function formatDnsRecords(records) {
  if (!records || records.length === 0) return 'No DNS records available';
  return records
    .map(r => `${r.type} ${r.name} ${r.content}`)
    .join('\n');
}

// ── JMAP session discovery ───────────────────────────────────────

/**
 * Discover JMAP session details for a user (accountId, identityId, draftsMailboxId).
 * Authenticates as the user (not admin) to get their personal session.
 *
 * Returns { jmap_account_id, jmap_identity_id, jmap_drafts_mailbox_id } or {} on failure.
 */
async function fetchJmapDetails(username, password) {
  try {
    const sessionResp = await fetch(`${STALWART_API_URL}/jmap/session`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });
    if (!sessionResp.ok) return {};
    const session = await sessionResp.json();
    const accountId = session.primaryAccounts?.['urn:ietf:params:jmap:mail'];
    if (!accountId) return {};

    const jmapResp = await fetch(`${STALWART_API_URL}/jmap/`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission'],
        methodCalls: [
          ['Identity/get', { accountId }, '0'],
          ['Mailbox/get', { accountId, properties: ['name', 'role'] }, '1'],
        ],
      }),
    });
    if (!jmapResp.ok) return { jmap_account_id: accountId };
    const jmap = await jmapResp.json();

    const identities = jmap.methodResponses?.[0]?.[1]?.list || [];
    const mailboxes = jmap.methodResponses?.[1]?.[1]?.list || [];
    const identityId = identities[0]?.id || '';
    const draftsId = mailboxes.find(m => m.role === 'drafts')?.id || '';

    return { jmap_account_id: accountId, jmap_identity_id: identityId, jmap_drafts_mailbox_id: draftsId };
  } catch (err) {
    console.error(`JMAP details fetch error for ${username}:`, err.message);
    return {};
  }
}

/**
 * Build the complete connection details object returned to Codesphere.
 * Fetches DNS records and JMAP details in parallel.
 */
async function buildDetails(username, email, domain, password) {
  const [dnsRecords, jmapDetails] = await Promise.all([
    fetchDnsRecords(domain),
    fetchJmapDetails(username, password),
  ]);
  return {
    email,
    username,
    mail_domain: domain,
    imap_host: STALWART_IMAP_HOST,
    imap_port: STALWART_IMAP_PORT,
    smtp_host: STALWART_SMTP_HOST,
    smtp_port: STALWART_SMTP_PORT,
    jmap_url: STALWART_JMAP_URL,
    jmap_account_id: jmapDetails.jmap_account_id || '',
    jmap_identity_id: jmapDetails.jmap_identity_id || '',
    jmap_drafts_mailbox_id: jmapDetails.jmap_drafts_mailbox_id || '',
    webmail_url: STALWART_WEBMAIL_URL,
    dns_records: formatDnsRecords(dnsRecords),
    ready: true,
  };
}

module.exports = {
  stalwartRequest,
  parseStalwartResponse,
  ensureDomain,
  fetchDnsRecords,
  formatDnsRecords,
  fetchJmapDetails,
  buildDetails,
};
