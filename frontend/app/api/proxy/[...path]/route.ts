import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTION_API_BASE_URL, sanitizeBaseUrl } from '@/lib/baseUrl';

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

/**
 * Phase 164a (M8) — proxy cache isolation + open-proxy removal.
 *
 * The audit (F12 / M8 root cause #4) found this route marking *every* 200 GET
 * `public, s-maxage=60`, including authenticated tenant reads, so a shared CDN
 * could serve one operator's response to another. Phase 161's `private,
 * no-store` on `/dashboard/bootstrap` never mattered: the proxy overwrote it.
 *
 * Contract now enforced here (and nowhere else, so the two cannot drift):
 *
 * - any request carrying `Authorization` or the `prehub_auth_token` cookie
 *   gets `private, no-store` — never a shared-cache entry;
 * - an anonymous GET is publicly cacheable **only** for an explicit allowlist
 *   of tenant-free paths (see `ANONYMOUS_PUBLIC_CACHE_PATHS`); every other
 *   anonymous GET is `private, no-store`;
 * - non-GET is `no-store`, and an event-stream/streaming body is never cached
 *   regardless of method or path;
 * - the upstream base is server-controlled (`API_PROXY_TARGET` →
 *   `NEXT_PUBLIC_API_URL` → canonical prod / local dev). The client-supplied
 *   `x-target-base-url` is honored **only** outside production and only for the
 *   two loopback origins, so this route can no longer be used as an open proxy.
 */

/** Anonymous GETs that carry no tenant data and may be shared-cached. */
const ANONYMOUS_PUBLIC_CACHE_PATHS = new Set<string>([
  '/api/v1/health',
  '/api/v1/health/sources',
]);

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=120';
const PRIVATE_CACHE_CONTROL = 'private, no-store';
const NO_STORE_CACHE_CONTROL = 'no-store';

/**
 * Loopback upstreams a local dev build may select via `x-target-base-url`.
 * Deliberately exact-match: `localhost` and `127.0.0.1` only, port 8000 only.
 */
const DEV_PROXY_TARGET_LIST = ['http://localhost:8000', 'http://127.0.0.1:8000'];
const DEV_PROXY_TARGETS = new Set<string>(DEV_PROXY_TARGET_LIST);

/** End-to-end headers only. Hop-by-hop and unknown headers are dropped. */
const FORWARDED_REQUEST_HEADERS = [
  'authorization',
  'accept',
  'content-type',
  'idempotency-key',
  'x-request-id',
  'if-none-match',
] as const;

/** Upstream response headers worth keeping for a correct client contract. */
const FORWARDED_RESPONSE_HEADERS = ['etag', 'last-modified', 'www-authenticate'] as const;

type TargetResolution =
  | { ok: true; baseUrl: string }
  | { ok: false; reason: string };

function resolveUpstreamBase(req: NextRequest): TargetResolution {
  const isProduction = process.env.NODE_ENV === 'production';

  // Production: the header is ignored, never trusted. A stale client that still
  // sends it is served from the server env like every other request.
  if (!isProduction) {
    const requestedRaw = req.headers.get('x-target-base-url');
    const requested = sanitizeBaseUrl(requestedRaw);
    if (requested) {
      if (DEV_PROXY_TARGETS.has(requested)) return { ok: true, baseUrl: requested };
      return {
        ok: false,
        reason: `x-target-base-url is only allowed for ${DEV_PROXY_TARGET_LIST.join(', ')}`,
      };
    }
    if (requestedRaw) {
      return { ok: false, reason: 'x-target-base-url is not a usable dev upstream' };
    }
  }

  const serverBase =
    sanitizeBaseUrl(process.env.API_PROXY_TARGET) ||
    sanitizeBaseUrl(process.env.NEXT_PUBLIC_API_URL) ||
    (isProduction ? PRODUCTION_API_BASE_URL : 'http://localhost:8000');

  return { ok: true, baseUrl: serverBase };
}

/** True when the caller presented a credential the CDN must not share. */
function isAuthenticatedRequest(req: NextRequest): boolean {
  if (req.headers.has('authorization')) return true;
  return Boolean(req.cookies.get('prehub_auth_token')?.value);
}

/**
 * The single cache decision for this route.
 *
 * Order matters: method/stream first (never cache a mutation or a stream), then
 * authentication (a private read is never shared), then the allowlist.
 */
function resolveCacheControl(opts: {
  method: string;
  authenticated: boolean;
  upstreamPath: string;
  status: number;
  contentType: string | null;
}): string {
  if (opts.method !== 'GET') return NO_STORE_CACHE_CONTROL;
  if (isStreamingContent(opts.contentType)) return NO_STORE_CACHE_CONTROL;
  if (opts.authenticated) return PRIVATE_CACHE_CONTROL;
  if (opts.status === 200 && ANONYMOUS_PUBLIC_CACHE_PATHS.has(opts.upstreamPath)) {
    return PUBLIC_CACHE_CONTROL;
  }
  return PRIVATE_CACHE_CONTROL;
}

function isStreamingContent(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  return /^text\/event-stream/i.test(contentType);
}

const PROXY_READ_TIMEOUT_MS = 30_000;
const PROXY_WRITE_TIMEOUT_MS = 60_000;

async function handleProxy(req: NextRequest, context: RouteContext) {
  const resolvedParams = await Promise.resolve(context.params);
  const pathSegments = resolvedParams?.path || [];
  const upstreamPath = `/${pathSegments.join('/')}`;

  const target = resolveUpstreamBase(req);
  if (!target.ok) {
    return NextResponse.json(
      { error: 'Invalid proxy target', message: target.reason },
      { status: 400, headers: { 'cache-control': PRIVATE_CACHE_CONTROL } },
    );
  }

  // Same sanitization as the client (trailing slash, missing scheme, dead host)
  // so the proxy can never forward to `https://host//api/...` or prehub-backend.
  const cleanBase = target.baseUrl.replace(/\/$/, '');
  const subpath = pathSegments.join('/');
  const targetUrl = subpath
    ? `${cleanBase}/${subpath}${req.nextUrl.search}`
    : `${cleanBase}${req.nextUrl.search}`;

  const forwardHeaders: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) forwardHeaders[name] = value;
  }

  const upstreamController = new AbortController();
  let timedOut = false;
  let clientAborted = req.signal.aborted;
  const forwardAbort = () => {
    clientAborted = true;
    upstreamController.abort();
  };
  if (!clientAborted) req.signal.addEventListener('abort', forwardAbort, { once: true });

  const timeoutMs = req.method === 'GET' || req.method === 'HEAD'
    ? PROXY_READ_TIMEOUT_MS
    : PROXY_WRITE_TIMEOUT_MS;
  const timeout = setTimeout(() => {
    timedOut = true;
    upstreamController.abort();
  }, timeoutMs);

  let rejectAbort!: (error: Error) => void;
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const rejectOnAbort = () => {
    const error = new Error(clientAborted ? 'Client closed the request' : 'Upstream request timed out');
    error.name = clientAborted ? 'AbortError' : 'TimeoutError';
    rejectAbort(error);
  };
  upstreamController.signal.addEventListener('abort', rejectOnAbort, { once: true });

  const cleanup = () => {
    clearTimeout(timeout);
    req.signal.removeEventListener('abort', forwardAbort);
    upstreamController.signal.removeEventListener('abort', rejectOnAbort);
  };

  try {
    if (clientAborted) throw new Error('Client closed the request');

    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const text = await Promise.race([req.text(), abortPromise]);
      if (text) body = text;
    }

    const upstreamRes = await Promise.race([
      fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body,
        signal: upstreamController.signal,
      }),
      abortPromise,
    ]);

    const upstreamContentType = upstreamRes.headers.get('content-type') || 'application/json';
    const streaming = isStreamingContent(upstreamContentType);

    const responseHeaders: Record<string, string> = {
      'content-type': upstreamContentType,
    };
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstreamRes.headers.get(name);
      if (value) responseHeaders[name] = value;
    }

    // Vercel's cache key does not include `Authorization`, which is how an
    // authenticated GET ended up shared. The directive above is the fix; `Vary`
    // is the belt-and-braces header for any other shared cache in the path.
    const cacheControl = resolveCacheControl({
      method: req.method,
      authenticated: isAuthenticatedRequest(req),
      upstreamPath,
      status: upstreamRes.status,
      contentType: upstreamContentType,
    });
    responseHeaders['cache-control'] = cacheControl;
    if (cacheControl === PUBLIC_CACHE_CONTROL) {
      responseHeaders['vary'] = 'Authorization, Cookie';
    }

    if (streaming) {
      // Bound connection setup, but not the lifetime of an event stream. Keep
      // forwarding client disconnects until the stream closes or is cancelled.
      clearTimeout(timeout);
      upstreamController.signal.removeEventListener('abort', rejectOnAbort);
      const stream = upstreamRes.body;
      if (!stream) {
        cleanup();
        return new NextResponse(null, { status: upstreamRes.status, headers: responseHeaders });
      }

      const reader = stream.getReader();
      const responseStream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              controller.close();
              cleanup();
            } else {
              controller.enqueue(chunk.value);
            }
          } catch (error) {
            controller.error(error);
            cleanup();
          }
        },
        async cancel(reason) {
          upstreamController.abort();
          cleanup();
          await reader.cancel(reason);
        },
      });
      return new NextResponse(responseStream, { status: upstreamRes.status, headers: responseHeaders });
    }

    // Buffer ordinary responses under the same deadline as connection setup.
    const upstreamBody = await Promise.race([upstreamRes.text(), abortPromise]);
    cleanup();
    return new NextResponse(upstreamBody, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    cleanup();
    const message = err instanceof Error ? err.message : 'Upstream request failed';
    if (clientAborted) {
      return NextResponse.json(
        { error: 'Client closed request', message },
        { status: 499, headers: { 'cache-control': PRIVATE_CACHE_CONTROL } },
      );
    }
    if (timedOut) {
      return NextResponse.json(
        { error: 'Upstream request timed out', message: `Upstream did not complete within ${timeoutMs} ms` },
        { status: 504, headers: { 'cache-control': PRIVATE_CACHE_CONTROL } },
      );
    }
    return NextResponse.json(
      {
        error: 'Proxy forwarding failed',
        message,
        targetUrl,
      },
      // Same contract as every other non-public response: private + no-store, so a
      // shared cache can never store (and later serve) a failed proxy response.
      { status: 502, headers: { 'cache-control': PRIVATE_CACHE_CONTROL } }
    );
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handleProxy(req, context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return handleProxy(req, context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return handleProxy(req, context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return handleProxy(req, context);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return handleProxy(req, context);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
