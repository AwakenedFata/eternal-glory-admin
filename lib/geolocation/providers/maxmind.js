import fs from 'fs';
import path from 'path';
import { Reader } from '@maxmind/geoip2-node';

let reader = null;
let initialized = false;

async function getReader() {
  if (initialized) return reader;
  initialized = true;
  
  try {
    const dbPath = path.resolve(process.cwd(), 'data', 'GeoLite2-City.mmdb');
    if (fs.existsSync(dbPath)) {
      reader = await Reader.open(dbPath);
      console.log("[Geolocation] Local MaxMind DB initialized.");
    } else {
      console.warn("[Geolocation] MaxMind database not found at", dbPath);
    }
  } catch (err) {
    console.error("[Geolocation] Failed to load MaxMind database:", err);
  }
  return reader;
}

export async function maxMindLookup(ip) {
  const r = await getReader();
  if (!r) return null; // Database not available, fallback to next provider

  try {
    const response = r.city(ip);
    
    // Extract data with safety checks
    const country = response.country?.names?.en || "Unknown";
    const countryCode = response.country?.isoCode || "Unknown";
    const region = response.subdivisions && response.subdivisions.length > 0 ? response.subdivisions[0].names.en : "Unknown";
    const regionCode = response.subdivisions && response.subdivisions.length > 0 ? response.subdivisions[0].isoCode : "Unknown";

    let buildEpoch = "Unknown";
    let dbType = "GeoLite2-City";
    if (r.mmdbReader && r.mmdbReader.metadata) {
      if (r.mmdbReader.metadata.buildEpoch) {
        buildEpoch = new Date(r.mmdbReader.metadata.buildEpoch.getTime()).toISOString();
      }
      if (r.mmdbReader.metadata.databaseType) {
        dbType = r.mmdbReader.metadata.databaseType;
      }
    }

    const reason = (country !== "Unknown" && region === "Unknown") ? "NO_REGION" : undefined;

    return {
      country,
      countryCode,
      region,
      regionCode,
      source: "LOCAL_MMDB",
      status: "RESOLVED",
      ...(reason && { reason }),
      databaseType: dbType,
      databaseBuildEpoch: buildEpoch,
      resolvedAt: new Date().toISOString()
    };
  } catch (err) {
    if (err.message && err.message.includes("not in the database")) {
      return {
        country: "Unknown",
        countryCode: "Unknown",
        region: "Unknown",
        regionCode: "Unknown",
        source: "LOCAL_MMDB",
        status: "UNRESOLVED",
        reason: "NO_RECORD",
        resolvedAt: new Date().toISOString()
      };
    }
    console.warn(`[MaxMind] Lookup failed for IP ${ip}:`, err.message);
    return null;
  }
}
