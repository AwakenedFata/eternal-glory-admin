export async function externalLookup(ip) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout
    
    const response = await fetch(`http://ip-api.com/json/${ip}`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status !== "success") {
      throw new Error(data.message || "Provider returned failure");
    }

    return {
      country: data.country || "Unknown",
      countryCode: data.countryCode || "Unknown",
      region: data.regionName || "Unknown",
      regionCode: data.region || "Unknown",
      source: "EXTERNAL_API",
      status: "RESOLVED",
      resolvedAt: new Date().toISOString()
    };
  } catch (err) {
    console.warn(`[External GeoIP] Lookup failed for IP ${ip}:`, err.message);
    return null;
  }
}
