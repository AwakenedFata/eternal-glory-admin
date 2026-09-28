import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Reader } from "@maxmind/geoip2-node";
import { getClientIp } from "@/lib/geolocation/get-client-ip";
import { geolocateIP } from "@/lib/geolocation/service";

/**
 * Admin-only diagnostic endpoint for geolocation system health.
 * Protected by middleware (NextAuth session required).
 *
 * Returns ONLY sanitized metadata. Never returns:
 * - raw IP addresses
 * - cookies / authorization headers
 * - raw proxy headers
 * - credential material
 */
export async function GET(req) {
  const dbPath = path.resolve(process.cwd(), "data", "GeoLite2-City.mmdb");
  const exists = fs.existsSync(dbPath);

  let databaseMeta = null;
  let error = null;

  if (exists) {
    try {
      const reader = await Reader.open(dbPath);
      const m = reader.mmdbReader?.metadata;
      if (m) {
        databaseMeta = {
          databaseType: m.databaseType,
          buildEpoch: m.buildEpoch
            ? new Date(m.buildEpoch.getTime()).toISOString()
            : null,
          ipVersion: m.ipVersion,
          nodeCount: m.nodeCount,
        };
      }
    } catch (err) {
      error = err.message;
    }
  }

  // Resolve location for the current caller
  const clientIp = getClientIp(req);
  const location = await geolocateIP(clientIp);

  // Determine which header source was used, without exposing values
  let clientIpSource = "UNKNOWN";
  if (process.env.NODE_ENV === "development" && process.env.DEV_MOCK_IP) {
    clientIpSource = "DEV_MOCK_IP";
  } else if (req.headers.get("x-vercel-forwarded-for")) {
    clientIpSource = "x-vercel-forwarded-for";
  } else if (req.headers.get("x-real-ip")) {
    clientIpSource = "x-real-ip";
  } else if (req.headers.get("x-forwarded-for")) {
    clientIpSource = "x-forwarded-for";
  } else {
    clientIpSource = "NONE_AVAILABLE";
  }

  return NextResponse.json({
    databaseAvailable: exists,
    databaseMetadata: databaseMeta,
    error,
    clientIpSource,
    resolvedLocation: {
      country: location.country,
      countryCode: location.countryCode,
      region: location.region,
      displayName: location.displayName,
      source: location.source,
      status: location.status,
      reason: location.reason || null,
      databaseType: location.databaseType || null,
      databaseBuildEpoch: location.databaseBuildEpoch || null,
      resolvedAt: location.resolvedAt || null,
    },
  });
}
