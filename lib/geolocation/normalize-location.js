/**
 * Standardizes the location object to ensure consistency across all providers.
 */
export function normalizeLocation(data) {
  // Extract fields with fallbacks
  const country = data.country || "Unknown";
  const countryCode = data.countryCode || "Unknown";
  const region = data.region || "Unknown";
  const regionCode = data.regionCode || "Unknown";
  const source = data.source || "NONE";
  const status = data.status || "UNRESOLVED";
  const reason = data.reason || null;

  // Formatting Display Name properly
  let displayName = "Unknown Location";
  if (region !== "Unknown" && country !== "Unknown") {
    displayName = `${region}, ${country}`;
  } else if (country !== "Unknown") {
    displayName = country;
  }

  const databaseType = data.databaseType || null;
  const databaseBuildEpoch = data.databaseBuildEpoch || null;
  const resolvedAt = data.resolvedAt || null;

  return {
    country,
    countryCode,
    region,
    regionCode,
    displayName,
    source,
    status,
    ...(reason && { reason }),
    ...(databaseType && { databaseType }),
    ...(databaseBuildEpoch && { databaseBuildEpoch }),
    ...(resolvedAt && { resolvedAt })
  };
}
