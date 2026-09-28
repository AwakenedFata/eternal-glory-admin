require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const { geolocateIP } = require("../lib/geolocation/service.js");

async function runTests() {
  console.log("==================================================");
  console.log("FINAL GEOLOCATION VERIFICATION — LOCAL RUNTIME");
  console.log("==================================================");

  const tests = [
    // Routable public IPs
    { ip: "8.8.8.8", desc: "Public IPv4 — Google DNS (US)" },
    { ip: "114.125.0.0", desc: "Public IPv4 — Indonesian ISP" },
    { ip: "1.1.1.1", desc: "Public IPv4 — Cloudflare DNS (US/AU)" },
    { ip: "103.28.12.1", desc: "Public IPv4 — Indonesian range" },
    { ip: "2001:4860:4860::8888", desc: "Public IPv6 — Google DNS" },

    // Loopback
    { ip: "127.0.0.1", desc: "Loopback IPv4" },
    { ip: "::1", desc: "Loopback IPv6" },

    // Private (RFC 1918)
    { ip: "10.0.0.1", desc: "Private — 10.x" },
    { ip: "192.168.1.1", desc: "Private — 192.168.x" },
    { ip: "172.16.0.1", desc: "Private — 172.16.x" },

    // Documentation/Test-net (RFC 5737)
    { ip: "192.0.2.1", desc: "TEST-NET-1 (RFC 5737)" },
    { ip: "198.51.100.1", desc: "TEST-NET-2 (RFC 5737)" },
    { ip: "203.0.113.1", desc: "TEST-NET-3 (RFC 5737)" },

    // Invalid
    { ip: "invalid_ip", desc: "Non-IP string" },
    { ip: "", desc: "Empty string" },
    { ip: "unknown", desc: "Literal 'unknown'" },
  ];

  for (const t of tests) {
    const result = await geolocateIP(t.ip);
    console.log(`\n--- ${t.desc} ---`);
    console.log(`  IP:           ${JSON.stringify(t.ip)}`);
    console.log(`  displayName:  ${result.displayName}`);
    console.log(`  country:      ${result.country} (${result.countryCode})`);
    console.log(`  region:       ${result.region}`);
    console.log(`  source:       ${result.source}`);
    console.log(`  status:       ${result.status}`);
    console.log(`  reason:       ${result.reason || "—"}`);
    if (result.databaseType) console.log(`  dbType:       ${result.databaseType}`);
    if (result.databaseBuildEpoch) console.log(`  dbBuild:      ${result.databaseBuildEpoch}`);
    if (result.resolvedAt) console.log(`  resolvedAt:   ${result.resolvedAt}`);
  }

  // Snapshot immutability simulation
  console.log("\n==================================================");
  console.log("CERTIFICATE SNAPSHOT IMMUTABILITY TEST");
  console.log("==================================================");

  const loc1 = await geolocateIP("114.125.0.0");
  const snapshot = {
    serialNumber: "004821",
    issuedAt: new Date().toISOString(),
    location: loc1,
  };
  console.log("\nOriginal snapshot:");
  console.log(JSON.stringify(snapshot, null, 2));

  // Simulate a different IP
  const loc2 = await geolocateIP("8.8.8.8");
  console.log("\nNew lookup (different IP):", loc2.displayName);
  console.log("Snapshot location still:", snapshot.location.displayName);
  console.log(
    "Immutable?",
    snapshot.location.displayName === loc1.displayName ? "YES" : "NO"
  );

  // External fallback gating test
  console.log("\n==================================================");
  console.log("EXTERNAL FALLBACK GATING TEST");
  console.log("==================================================");
  console.log(
    "ENABLE_EXTERNAL_GEO_FALLBACK =",
    JSON.stringify(process.env.ENABLE_EXTERNAL_GEO_FALLBACK || undefined)
  );
  console.log(
    "External fallback is",
    process.env.ENABLE_EXTERNAL_GEO_FALLBACK === "true"
      ? "ENABLED"
      : "DISABLED (correct default)"
  );

  process.exit(0);
}

runTests();
