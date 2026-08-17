/*
 * EMERGE 2026 — Health Corner
 * Same-origin JSON bridge for Vercel -> Google Apps Script.
 *
 * The browser never talks directly to script.google.com.
 * The browser also never relies on hidden iframes, JSONP or postMessage
 * for Health Corner backend results. This endpoint always returns JSON.
 */

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbx7q4v02ASIbSxKjtbKsh4__MbdGAe8anK5GpSn14OiAvoNNP_6r0fgsI2nKlkIfDmsCQ/exec';

const ALLOWED_GET_ACTIONS = new Set(['', 'registrationStatus', 'verify']);
const ALLOWED_POST_ACTIONS = new Set(['', 'authorizeRedemption', 'redeem']);

function responseHeaders(extra = {}) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    pragma: 'no-cache',
    expires: '0',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra,
  };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(extraHeaders),
  });
}

function jsonError(message, status = 400, code = 'BRIDGE_ERROR') {
  return jsonResponse({ success: false, code, message }, status);
}

function extractBalancedObject(text, start) {
  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (insideString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        insideString = false;
      }
      continue;
    }

    if (ch === '"') {
      insideString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function extractPayloadFromHtml(html) {
  const marker = /(?:const|let|var)\s+payload\s*=/m.exec(html);
  if (!marker) return null;

  const afterMarker = marker.index + marker[0].length;
  const objectStart = html.indexOf('{', afterMarker);
  if (objectStart === -1) return null;

  const jsonText = extractBalancedObject(html, objectStart);
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function extractPayloadFromJsonp(text) {
  const firstParen = text.indexOf('(');
  const lastParen = text.lastIndexOf(')');
  if (firstParen === -1 || lastParen <= firstParen) return null;

  const inside = text.slice(firstParen + 1, lastParen).trim();
  if (!inside.startsWith('{')) return null;

  try {
    return JSON.parse(inside);
  } catch {
    return null;
  }
}

function parseUpstreamPayload(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    const json = JSON.parse(trimmed);
    if (json && typeof json === 'object') return json;
  } catch {
    // Not raw JSON; continue.
  }

  const htmlPayload = extractPayloadFromHtml(trimmed);
  if (htmlPayload) return htmlPayload;

  const jsonpPayload = extractPayloadFromJsonp(trimmed);
  if (jsonpPayload) return jsonpPayload;

  return null;
}

function getBodyAction(contentType, body) {
  if (!body) return '';

  if (contentType.startsWith('application/x-www-form-urlencoded')) {
    try {
      return String(new URLSearchParams(body).get('action') || '').trim();
    } catch {
      return '';
    }
  }

  if (contentType.startsWith('application/json')) {
    try {
      return String(JSON.parse(body).action || '').trim();
    } catch {
      return '';
    }
  }

  return '';
}

export default {
  async fetch(request) {
    const startedAt = Date.now();
    const method = request.method.toUpperCase();

    if (method !== 'GET' && method !== 'POST') {
      return jsonError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
    }

    const incomingUrl = new URL(request.url);
    let upstreamBody;
    let contentType = '';
    let bodyAction = '';

    if (method === 'POST') {
      contentType =
        request.headers.get('content-type') ||
        'application/x-www-form-urlencoded;charset=UTF-8';

      const supported =
        contentType.startsWith('application/x-www-form-urlencoded') ||
        contentType.startsWith('application/json') ||
        contentType.startsWith('text/plain');

      if (!supported) {
        return jsonError(
          'Unsupported request content type.',
          415,
          'UNSUPPORTED_CONTENT_TYPE',
        );
      }

      upstreamBody = await request.text();
      bodyAction = getBodyAction(contentType, upstreamBody);
    }

    const queryAction = String(incomingUrl.searchParams.get('action') || '').trim();
    const action = queryAction || bodyAction || '';

    if (method === 'GET' && !ALLOWED_GET_ACTIONS.has(action)) {
      return jsonError('Unsupported Health Corner request.', 400, 'UNSUPPORTED_ACTION');
    }

    if (method === 'POST' && !ALLOWED_POST_ACTIONS.has(action)) {
      return jsonError('Unsupported Health Corner request.', 400, 'UNSUPPORTED_ACTION');
    }

    const upstreamUrl = new URL(APPS_SCRIPT_URL);
    incomingUrl.searchParams.forEach((value, key) => {
      // The bridge itself no longer uses JSONP.
      if (key !== 'prefix') upstreamUrl.searchParams.append(key, value);
    });

    const upstreamHeaders = new Headers();
    if (method === 'POST') upstreamHeaders.set('content-type', contentType);

    // Keep the upstream timeout below the Vercel function's configured
    // 60-second maximum so we can return a controlled JSON error.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstreamUrl.toString(), {
        method,
        headers: upstreamHeaders,
        body: method === 'POST' ? upstreamBody : undefined,
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);

      if (error && error.name === 'AbortError') {
        return jsonError(
          'The Health Corner backend took too long to respond. Please try again.',
          504,
          'UPSTREAM_TIMEOUT',
        );
      }

      return jsonError(
        'The Health Corner backend is temporarily unavailable.',
        502,
        'UPSTREAM_UNAVAILABLE',
      );
    }

    clearTimeout(timeout);

    let upstreamText;
    try {
      upstreamText = await upstreamResponse.text();
    } catch {
      return jsonError(
        'The Health Corner backend returned an unreadable response.',
        502,
        'UPSTREAM_UNREADABLE',
      );
    }

    const payload = parseUpstreamPayload(upstreamText);

    if (!payload) {
      console.error('Health Corner upstream response could not be normalised', {
        status: upstreamResponse.status,
        contentType: upstreamResponse.headers.get('content-type') || '',
        length: upstreamText.length,
        elapsedMs: Date.now() - startedAt,
      });

      return jsonError(
        'The Health Corner backend returned an unexpected response.',
        502,
        'UPSTREAM_BAD_RESPONSE',
      );
    }

    return jsonResponse(
      payload,
      upstreamResponse.ok ? 200 : upstreamResponse.status,
      {
        'x-health-corner-upstream-ms': String(Date.now() - startedAt),
      },
    );
  },
};
