/**
 * Extracts the trusted client IP address from a request, aware of Vercel/CDN deployment headers.
 * 
 * Vercel and similar proxies append the real IP to standard headers.
 * We prioritize Vercel's specific header over standard x-forwarded-for to prevent spoofing
 * if the request bypasses the CDN (though Vercel prevents this natively).
 */
export function getClientIp(req) {
  // 1. Local Development Mock (Explicitly gated by NODE_ENV)
  if (process.env.NODE_ENV === "development" && process.env.DEV_MOCK_IP) {
    return process.env.DEV_MOCK_IP;
  }

  // 2. Vercel specific real IP
  const vercelIp = req.headers.get("x-vercel-forwarded-for");
  if (vercelIp) {
    // Vercel forwards the IPs as a comma-separated list, first is usually the real client
    return vercelIp.split(",")[0].trim();
  }

  // 3. Real-IP (common in Nginx / standard proxies)
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // 4. Standard X-Forwarded-For
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  // Fallback for absolute unknowns
  return "unknown";
}
