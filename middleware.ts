// middleware.ts (or middleware.js if you use JS)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// optionally define which routes are public
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/clerk',
  '/api/webhooks/stripe',
]);

export default clerkMiddleware(async (auth, req) => {
  // if the route is in your public list, let it through
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // otherwise require authentication
  await auth.protect();  // redirect unauthenticated users
});

export const config = {
  matcher: [
    '/((?!.+\\.[\\w]+$|_next).*)', 
    '/', 
    '/(api|trpc)(.*)'
  ],
};
