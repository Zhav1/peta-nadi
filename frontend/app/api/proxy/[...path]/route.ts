import { NextRequest, NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

async function handleProxy(req: NextRequest, context: RouteContext) {
  const resolvedParams = await Promise.resolve(context.params);
  const pathSegments = resolvedParams?.path || [];

  let baseUrl =
    req.headers.get('x-target-base-url') ||
    process.env.NEXT_PUBLIC_API_URL ||
    'https://peta-nadi.onrender.com';

  if (baseUrl.includes('prehub-backend.onrender.com')) {
    baseUrl = 'https://peta-nadi.onrender.com';
  }

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

    // Cache-Control for GET read requests: Vercel CDN/Edge cache for 60s with 120s stale-while-revalidate
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
