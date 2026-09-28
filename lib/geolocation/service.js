import { normalizeLocation } from './normalize-location.js';
import { maxMindLookup } from './providers/maxmind.js';
import { externalLookup } from './providers/external.js';

/**
 * Classifies an IP and returns a reason string if it should not be geolocated.
 * Returns null if the IP is a routable public address.
 */
function classifyNonRoutableIp(ip) {
  if (!ip || ip === "unknown") return "INVALID_IP";
  if (ip === "127.0.0.1" || ip === "::1") return "LOCAL_IP";

  // Private IPv4 ranges (RFC 1918)
  if (ip.startsWith("10.")) return "LOCAL_IP";
  if (ip.startsWith("192.168.")) return "LOCAL_IP";
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return "LOCAL_IP";

  // Documentation/test-net IPs (RFC 5737) - these are NOT real public IPs
  if (ip.startsWith("192.0.2.")) return "INVALID_IP";      // TEST-NET-1
  if (ip.startsWith("198.51.100.")) return "INVALID_IP";   // TEST-NET-2
  if (ip.startsWith("203.0.113.")) return "INVALID_IP";    // TEST-NET-3

  // Basic format validation: must contain at least one dot (IPv4) or colon (IPv6)
  if (!ip.includes(".") && !ip.includes(":")) return "INVALID_IP";

  return null; // Routable public IP
}

/**
 * Provider-agnostic service to geolocate an IP.
 */
export async function geolocateIP(ip) {
  // 1. Filter out non-routable / invalid IPs early
  const nonRoutableReason = classifyNonRoutableIp(ip);
  if (nonRoutableReason) {
    return normalizeLocation({
      source: "NONE",
      status: "UNRESOLVED",
      reason: nonRoutableReason
    });
  }

  let result = null;

  // 2. Try Local MMDB Primary Provider
  try {
    result = await maxMindLookup(ip);
  } catch (err) {
    console.error("[Geolocation] maxMindLookup threw an error:", err);
  }

  // 3. Optional External Fallback
  const needsFallback = !result || result.status === "UNRESOLVED";
  
  if (needsFallback && process.env.ENABLE_EXTERNAL_GEO_FALLBACK === "true") {
    try {
      const extResult = await externalLookup(ip);
      if (extResult) {
        result = extResult;
      }
    } catch (err) {
      console.error("[Geolocation] externalLookup threw an error:", err);
    }
  }

  // 4. Return result or final fallback
  if (result) {
    return normalizeLocation(result);
  } else {
    return normalizeLocation({
      source: "NONE",
      status: "UNRESOLVED",
      reason: "PROVIDER_FAILURE"
    });
  }
}
