/*
 * EMERGE 2026 — Health Corner
 * Same-origin Vercel bridge for Google Apps Script.
 *
 * Browser -> /api/health-corner -> Apps Script -> JSON -> Browser
 *
 * The browser never talks to script.google.com directly.
 */

export const maxDuration = 60;

const UPSTREAM_TIMEOUT_MS = 50000;

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbx7q4v02ASIbSxKjtbKsh4__MbdGAe8anK5GpSn14OiAvoNNP_6r0fgsI2nKlkIfDmsCQ/exec';

const ALLOWED_GET_ACTIONS = new Set([
  '',
  'registrationStatus',
  'verify'
]);

const ALLOWED_POST_ACTIONS = new Set([
  '',
  'authorizeRedemption',
  'redeem'
]);

function responseHeaders(extra = {}) {
  return {
    'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    pragma: 'no-cache',
    expires: '0',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra
  };
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders({
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders
    })
  });
}

function clean(value) {
  return String(value || '').trim();
}

function getBodyValues(contentType, body) {
  if (!body) return {};

  if (contentType.startsWith('application/x-www-form-urlencoded')) {
    try {
      return Object.fromEntries(new URLSearchParams(body).entries());
    } catch (_) {
      return {};
    }
  }

  if (contentType.startsWith('application/json')) {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  return {};
}

function expectedResponseType(method, action) {
  if (method === 'GET' && action === 'registrationStatus') {
    return 'REGISTRATION_STATUS_RESULT';
  }
  if (method === 'GET' && action === 'verify') {
    return 'VERIFICATION_RESULT';
  }
  if (method === 'POST' && action === 'authorizeRedemption') {
    return 'REDEMPTION_AUTH_RESULT';
  }
  if (method === 'POST' && action === 'redeem') {
    return 'REDEMPTION_RESULT';
  }
  if (method === 'POST' && action === '') {
    return 'REGISTRATION_RESULT';
  }
  return '';
}

function normaliseEnvelope(payload, method, action, callbackNonce) {
  const safePayload =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? { ...payload }
      : { success: false, message: 'Invalid Health Corner response.' };

  const type = expectedResponseType(method, action);

  // The Vercel endpoint is same-origin and is the trusted transport boundary.
  // Add the legacy envelope fields here so older/still-cached page code and
  // the new direct-JSON code both receive one predictable response shape.
  safePayload.source = 'EMERGE_HEALTH_CORNER';
  if (type) safePayload.type = type;
  if (callbackNonce) safePayload.callbackNonce = callbackNonce;

  return safePayload;
}

/*
 * Apps Script's iframeResponse_() writes:
 *   const payload = {...};
 * Extract only that JSON object. This is data parsing, not script execution.
 */
function extractPayloadFromHtml(html) {
  const marker = /(?:const|let|var)\s+payload\s*=/m.exec(html || '');
  if (!marker) return null;

  let i = marker.index + marker[0].length;
  while (i < html.length && /\s/.test(html[i])) i += 1;
  if (html[i] !== '{') return null;

  const start = i;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; i < html.length; i += 1) {
    const ch = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }

  return null;
}

function extractJsonp(text) {
  const match = /^\s*[A-Za-z_$][\w$]*\s*\((.*)\)\s*;?\s*$/s.exec(text || '');
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return null;
  }
}

function normaliseAppsScriptResponse(text, contentType) {
  const type = clean(contentType).toLowerCase();

  if (type.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch (_) {
      // Continue to the other parsers below.
    }
  }

  const htmlPayload = extractPayloadFromHtml(text);
  if (htmlPayload) return htmlPayload;

  const jsonpPayload = extractJsonp(text);
  if (jsonpPayload) return jsonpPayload;

  // Apps Script's health check is JSON, but ContentService may occasionally
  // arrive with a generic text content type after redirects.
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (_) {}

  return null;
}

export default {
  async fetch(request) {
    const startedAt = Date.now();
    const method = request.method.toUpperCase();

    if (method !== 'GET' && method !== 'POST') {
      return json({ success: false, message: 'Method not allowed.' }, 405);
    }

    const incomingUrl = new URL(request.url);
    let body = undefined;
    let contentType = '';
    let bodyAction = '';
    let bodyValues = {};

    if (method === 'POST') {
      contentType = request.headers.get('content-type') ||
        'application/x-www-form-urlencoded;charset=UTF-8';

      const supported =
        contentType.startsWith('application/x-www-form-urlencoded') ||
        contentType.startsWith('application/json') ||
        contentType.startsWith('text/plain');

      if (!supported) {
        return json({ success: false, message: 'Unsupported request content type.' }, 415);
      }

      body = await request.text();
      bodyValues = getBodyValues(contentType, body);
      bodyAction = clean(bodyValues.action);
    }

    const queryAction = clean(incomingUrl.searchParams.get('action'));
    const action = queryAction || bodyAction;
    const callbackNonce = clean(
      incomingUrl.searchParams.get('callbackNonce') || bodyValues.callbackNonce
    );

    if (method === 'GET' && !ALLOWED_GET_ACTIONS.has(action)) {
      return json({ success: false, message: 'Unsupported Health Corner request.' }, 400);
    }

    if (method === 'POST' && !ALLOWED_POST_ACTIONS.has(action)) {
      return json({ success: false, message: 'Unsupported Health Corner request.' }, 400);
    }

    const upstreamUrl = new URL(APPS_SCRIPT_URL);
    incomingUrl.searchParams.forEach((value, key) => {
      upstreamUrl.searchParams.append(key, value);
    });

    const headers = new Headers({
      accept: 'application/json,text/html,text/plain,*/*'
    });

    if (method === 'POST') {
      headers.set('content-type', contentType);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let upstream;
    try {
      upstream = await fetch(upstreamUrl.toString(), {
        method,
        headers,
        body: method === 'POST' ? body : undefined,
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timer);
      const timedOut = error && error.name === 'AbortError';
      console.error('Health Corner upstream request failed', error);
      return json(
        {
          success: false,
          code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
          message: timedOut
            ? 'The Health Corner service took too long to respond. Please try again.'
            : 'The Health Corner service is temporarily unavailable.'
        },
        timedOut ? 504 : 502,
        { 'x-health-corner-upstream-ms': String(Date.now() - startedAt) }
      );
    }

    clearTimeout(timer);

    const text = await upstream.text();
    const payload = normaliseAppsScriptResponse(
      text,
      upstream.headers.get('content-type') || ''
    );

    if (!payload) {
      console.error('Unparseable Apps Script response', {
        status: upstream.status,
        contentType: upstream.headers.get('content-type'),
        preview: text.slice(0, 300)
      });

      return json(
        {
          success: false,
          code: 'UPSTREAM_BAD_RESPONSE',
          message: 'The Health Corner service returned an unexpected response. Please try again.'
        },
        502,
        { 'x-health-corner-upstream-ms': String(Date.now() - startedAt) }
      );
    }

    const normalisedPayload = normaliseEnvelope(
      payload,
      method,
      action,
      callbackNonce
    );

    return json(
      normalisedPayload,
      upstream.ok ? 200 : upstream.status,
      {
        'x-health-corner-upstream-ms': String(Date.now() - startedAt),
        'x-health-corner-action': action || 'registration'
      }
    );
  }
};
