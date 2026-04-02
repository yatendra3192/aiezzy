import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const protectedPages = ['/my-trips', '/plan', '/route', '/deep-plan', '/settings'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect specific pages
  const isProtected = protectedPages.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (!isProtected) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const signInUrl = new URL('/', req.url);
    signInUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/my-trips/:path*', '/plan/:path*', '/route/:path*', '/deep-plan/:path*', '/settings/:path*'],
};
