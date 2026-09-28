const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { geolocateIP } = require('../lib/geolocation/service');
const { generateCertificatePDF } = require('../lib/certificates/generator');

async function runTests() {
  console.log("==================================================");
  console.log("PHASE CERTIFICATE UI — VISUAL & DATA VALIDATION");
  console.log("==================================================");

  // 1. IP Geolocation Test (Test 3)
  console.log("-> Test 3: IP Geolocation (Valid IP vs Unknown)");
  const loc1 = await geolocateIP("8.8.8.8");
  console.log("8.8.8.8 resolved to:", loc1.displayName);
  const loc2 = await geolocateIP("127.0.0.1");
  console.log("127.0.0.1 resolved to:", loc2.displayName);

  // 2. Visual / Render Validation (Test 1 & 2)
  console.log("\n-> Test 1: Rendering PDF for Test 1 Data");
  
  try {
    const test1Date = new Date("2026-01-01T00:00:00Z");
    const test1Pdf = await generateCertificatePDF("012345", "PUB-CERT-123", test1Date, { displayName: "West Java, Indonesia" });
    const outPath1 = path.join(__dirname, 'test1_certificate.pdf');
    fs.writeFileSync(outPath1, test1Pdf.pdfBuffer);
    console.log(`Saved Test 1 PDF to ${outPath1} (${test1Pdf.fileSize} bytes)`);

    console.log("\n-> Test 2: Rendering PDF for Test 2 Data");
    const test2Date = new Date("2026-09-27T00:00:00Z");
    const test2Pdf = await generateCertificatePDF("000001", "PUB-CERT-456", test2Date, { displayName: "California, United States" });
    const outPath2 = path.join(__dirname, 'test2_certificate.pdf');
    fs.writeFileSync(outPath2, test2Pdf.pdfBuffer);
    console.log(`Saved Test 2 PDF to ${outPath2} (${test2Pdf.fileSize} bytes)`);

  } catch (err) {
    console.error("PDF Rendering Failed:", err);
  }
}

runTests();
