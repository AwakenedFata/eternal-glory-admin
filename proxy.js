import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ req, token }) => {
      // Allow the public API routes and webhook receivers
      if (req.nextUrl.pathname.startsWith('/api/public') || req.nextUrl.pathname.startsWith('/api/webhooks')) {
        return true;
      }
      
      // Allow the worker trigger which is authenticated via its own CRON_SECRET
      if (req.nextUrl.pathname === '/api/admin/webhooks/worker') {
        return true;
      }

      // For all other /admin or /api/admin routes, require a valid token
      return !!token;
    },
  },
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
