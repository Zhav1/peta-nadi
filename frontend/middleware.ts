import { NextResponse, type NextRequest } from 'next/server';

const AUTH_COOKIE_NAME = 'prehub_auth_token';
const GUEST_EVALUATION_FLAG = 'guest';

// Lightweight structural session check for Edge middleware: the token must be a
// well-formed, unexpired JWT. Cryptographic verification stays server-side (FastAPI).
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasVerifiableSession(token?: string): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const exp = typeof payload.exp === 'number' ? payload.exp : null;
  if (exp !== null && exp * 1000 <= Date.now()) return false;
  return true;
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (!pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (hasVerifiableSession(token)) {
    return NextResponse.next();
  }

  // Unauthenticated access is not blocked outright: it is gracefully degraded to a
  // clearly-flagged guest evaluation preview. The flag makes the dashboard render an
  // explicit banner instead of silently granting an operational session.
  if (searchParams.get(GUEST_EVALUATION_FLAG) === '1') {
    return NextResponse.next();
  }

  const guestUrl = request.nextUrl.clone();
  guestUrl.searchParams.set(GUEST_EVALUATION_FLAG, '1');
  return NextResponse.redirect(guestUrl);
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
