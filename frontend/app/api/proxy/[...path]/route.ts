import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTION_API_BASE_URL, sanitizeBaseUrl } from '@/lib/baseUrl';

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

async function handleProxy(req: NextRequest, context: RouteContext) {
  const resolvedParams = await Promise.resolve(context.params);
  const pathSegments = resolvedParams?.path || [];

  // Same sanitization as the client (trailing slash, missing scheme, dead host)
  // so the proxy can never forward to `https://host//api/...` or prehub-backend.
  const baseUrl =
    sanitizeBaseUrl(req.headers.get('x-target-base-url')) ||
    sanitizeBaseUrl(process.env.NEXT_PUBLIC_API_URL) ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_API_BASE_URL : 'http://localhost:8000');

  const cleanBase = baseUrl.replace(/\/$/, '');
  const subpath = pathSegments.join('/');
  const targetUrl = subpath
    ? `${cleanBase}/${subpath}${req.nextUrl.search}`
    : `${cleanBase}${req.nextUrl.search}`;

  const forwardHeaders: Record<string, string> = {};
  const accept = req.headers.get('accept');
  if (accept) forwardHeaders['accept'] = accept;

  const contentType = req.headers.get('content-type');
  if (contentType) forwardHeaders['content-type'] = contentType;

  const auth = req.headers.get('authorization');
  if (auth) forwardHeaders['authorization'] = auth;

  let body: string | undefined = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const text = await req.text();
      if (text && text.length > 0) {
        body = text;
      }
    } catch {
      // body empty or cannot be read
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    const upstreamText = await upstreamRes.text();
    const upstreamContentType = upstreamRes.headers.get('content-type') || 'application/json';

    const responseHeaders: Record<string, string> = {
      'content-type': upstreamContentType,
    };

    // Cache-Control for GET read requests: Vercel CDN/Edge cache for 60s with 120s stale-while-revalidate.
    // The upstream JSON body is forwarded verbatim, so its `last_updated` stays frozen for the
    // whole cache window — it is the time the backend assembled the payload, NOT the time of this
    // response. Clients must compare article IDs and only advance their own "diperbarui" clock
    // when they change; a cached body time must never be treated as a freshness signal.
    if (req.method === 'GET' && upstreamRes.status === 200) {
      responseHeaders['cache-control'] = 'public, s-maxage=60, stale-while-revalidate=120';
    }

    return new NextResponse(upstreamText, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upstream request failed';
    return NextResponse.json(
      {
        error: 'Proxy forwarding failed',
        message,
        targetUrl,
      },
      { status: 502 }
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
