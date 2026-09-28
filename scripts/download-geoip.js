const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Downloads the GeoLite2-City MMDB from MaxMind.
 *
 * Credential source (in order):
 *   1. MAXMIND_LICENSE_KEY environment variable (preferred for CI/production)
 *   2. Local GeoIP.conf file (development convenience only)
 *
 * Security rules:
 *   - The license key is NEVER logged, printed, or embedded in error messages.
 *   - The download URL (which contains the key) is NEVER logged.
 *   - GeoIP.conf must be in .gitignore.
 */

// --- Resolve license key ---
let licenseKey = process.env.MAXMIND_LICENSE_KEY;

if (!licenseKey) {
  try {
    const confPath = path.resolve(__dirname, "../GeoIP.conf");
    if (fs.existsSync(confPath)) {
      const conf = fs.readFileSync(confPath, "utf8");
      const match = conf.match(/LicenseKey\s+([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        licenseKey = match[1];
        console.log("[GeoIP] License key loaded from GeoIP.conf");
      }
    }
  } catch (err) {
    console.warn("[GeoIP] Could not read GeoIP.conf:", err.message);
  }
}

if (!licenseKey) {
  console.error(
    "[GeoIP] No MAXMIND_LICENSE_KEY found in env or GeoIP.conf. Skipping database download."
  );
  process.exit(0);
}

// --- Paths ---
const dbName = "GeoLite2-City";
const dataDir = path.resolve(__dirname, "../data");
const tarballPath = path.join(dataDir, `${dbName}.tar.gz`);
const mmdbFinalPath = path.join(dataDir, `${dbName}.mmdb`);

// Build URL (never logged)
const downloadUrl = `https://download.maxmind.com/app/geoip_download?edition_id=${dbName}&license_key=${licenseKey}&suffix=tar.gz`;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function downloadAndExtract() {
  console.log(`[GeoIP] Downloading ${dbName} database...`);

  try {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      // Do NOT include URL in error (it contains the key)
      console.error(
        `[GeoIP] Download failed. HTTP ${response.status}. Check that MAXMIND_LICENSE_KEY is valid.`
      );
      process.exit(1);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tarballPath, Buffer.from(buffer));
    console.log("[GeoIP] Download complete. Extracting...");

    // Extract tar.gz
    execSync(`tar -xzf ${dbName}.tar.gz`, { cwd: dataDir, stdio: "pipe" });

    // Find extracted folder and move the mmdb out
    const entries = fs.readdirSync(dataDir);
    const folder = entries.find(
      (f) =>
        f.startsWith(`${dbName}_`) &&
        fs.statSync(path.join(dataDir, f)).isDirectory()
    );

    if (folder) {
      const extractedMmdb = path.join(dataDir, folder, `${dbName}.mmdb`);
      if (fs.existsSync(extractedMmdb)) {
        // Overwrite if already exists
        if (fs.existsSync(mmdbFinalPath)) {
          fs.unlinkSync(mmdbFinalPath);
        }
        fs.renameSync(extractedMmdb, mmdbFinalPath);
        console.log(`[GeoIP] Database extracted to data/${dbName}.mmdb`);

        // Report file size for deployment awareness
        const stats = fs.statSync(mmdbFinalPath);
        console.log(
          `[GeoIP] Database size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`
        );
      } else {
        console.error("[GeoIP] MMDB file not found inside extracted archive.");
      }

      // Cleanup extracted folder
      fs.rmSync(path.join(dataDir, folder), { recursive: true, force: true });
    } else {
      console.error("[GeoIP] Could not find extracted folder.");
    }

    // Cleanup tarball
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
  } catch (err) {
    // Sanitize error: never include URL or key in output
    console.error("[GeoIP] Error during download/extraction:", err.message);
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }
    process.exit(1);
  }
}

downloadAndExtract();
