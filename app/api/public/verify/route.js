import { NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/db/mongoose";
import { Serial, VerificationEvent, Certificate, Nonce } from "@/lib/db/models";
import { hashCode } from "@/lib/serial/service";
import { processCertificateGeneration } from "@/lib/certificates/service";

export async function POST(req) {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) return NextResponse.json({ error: "Internal server error" }, { status: 500 });

  const timestamp = req.headers.get("X-Internal-Timestamp");
  const nonce = req.headers.get("X-Internal-Nonce");
  const signature = req.headers.get("X-Internal-Signature");
  const userAgent = req.headers.get("user-agent") || "";

  if (!timestamp || !nonce || !signature) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 60000) return NextResponse.json({ error: "Request expired" }, { status: 401 });

  let bodyString;
  let body;
  try {
    bodyString = await req.text();
    body = JSON.parse(bodyString);
  } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const method = "POST";
  const path = "/api/public/verify";
  const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');
  const canonicalString = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(canonicalString).digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  } catch (e) { return NextResponse.json({ error: "Invalid signature format" }, { status: 403 }); }

  try { await dbConnect(); } catch (err) { console.error("DB connection failed:", err); return NextResponse.json({ error: "Database connection failed" }, { status: 500 }); }

  try {
    await Nonce.create({ nonce });
  } catch (err) {
    return NextResponse.json({ error: "Replay detected" }, { status: 403 });
  }

  const code = body.code;
  const claimToken = body.claimToken;
  
  const rawLocation = body.verificationContext?.location;
  if (!rawLocation || typeof rawLocation !== "object") return NextResponse.json({ error: "Invalid location schema" }, { status: 400 });
  
  const location = {
    country: String(rawLocation.country || ""),
    countryCode: rawLocation.countryCode ? String(rawLocation.countryCode) : undefined,
    region: rawLocation.region ? String(rawLocation.region) : null,
    regionCode: rawLocation.regionCode ? String(rawLocation.regionCode) : undefined,
    displayName: String(rawLocation.displayName || "Unknown Location").substring(0, 100),
    source: String(rawLocation.source || "UNKNOWN"),
    status: String(rawLocation.status || "UNRESOLVED"),
    databaseType: rawLocation.databaseType ? String(rawLocation.databaseType) : undefined,
    databaseBuildEpoch: rawLocation.databaseBuildEpoch ? String(rawLocation.databaseBuildEpoch) : undefined,
    resolvedAt: rawLocation.resolvedAt ? String(rawLocation.resolvedAt) : new Date().toISOString(),
    timeZone: rawLocation.timeZone ? String(rawLocation.timeZone) : undefined
  };

  if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) return NextResponse.json({ error: "Invalid serial number format" }, { status: 400 });

  const codeHashValue = hashCode(code);
  const serial = await Serial.findOne({ codeHash: codeHashValue });

  const ipHash = "internal-authenticated";

  if (!serial || serial.status === "VOID") {
    await logVerificationEvent(serial?._id, "INVALID", ipHash, userAgent, nonce);
    return NextResponse.json({ result: "INVALID", message: "Serial number not found." });
  }

  function getWorkerUrl(req) {
    try {
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
      const proto = req.headers.get("x-forwarded-proto") || "https";
      if (host) {
        return `${proto}://${host}/api/worker/certificates`;
      }
      return new URL("/api/worker/certificates", req.url).toString();
    } catch (e) {
      return null;
    }
  }

  // ALREADY VERIFIED FLOW
  if (serial.status === "VERIFIED") {
    await logVerificationEvent(serial._id, "ALREADY_VERIFIED", ipHash, userAgent, nonce);
    let certificate = await Certificate.findOne({ serialId: serial._id });
    if (!certificate || certificate.status === "FAILED") {
      try {
        const result = await processCertificateGeneration(serial._id, code, location);
        certificate = result.certificate;
        
        const workerUrl = getWorkerUrl(req);
        if (workerUrl) {
          console.log(`[VERIFY] scheduling immediate worker: ${workerUrl}`);
          after(() => {
            console.log(`[VERIFY] after callback started for ALREADY_VERIFIED`);
            fetch(workerUrl, { method: "POST", headers: { "Authorization": `Bearer ${process.env.INTERNAL_SERVICE_SECRET}` } })
              .then(r => console.log(`[VERIFY] worker response: ${r.status}`))
              .catch(err => console.error(`[VERIFY] worker trigger failed:`, err));
          });
        }
      } catch (err) {}
    }

    let isAuthorized = false;
    if (certificate && certificate.claimTokenHash && typeof claimToken === 'string') {
      if (crypto.createHash("sha256").update(claimToken).digest("hex") === certificate.claimTokenHash) isAuthorized = true;
    }
    return NextResponse.json({
      result: "ALREADY_VERIFIED", authentic: true, certificateAccess: isAuthorized,
      message: "This product has already been verified.", verifiedAt: serial.verifiedAt,
      certificate: (isAuthorized && certificate) ? { publicId: certificate.publicId, status: certificate.status, claimToken } : null
    });
  }

  // Mark as verified
  const updated = await Serial.findOneAndUpdate(
    { _id: serial._id, status: { $in: ["AVAILABLE", "ASSIGNED", "ALLOCATED"] } },
    { $set: { status: "VERIFIED", verifiedAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    await logVerificationEvent(serial._id, "ALREADY_VERIFIED", ipHash, userAgent, nonce);
    const existingCert = await Certificate.findOne({ serialId: serial._id });
    return NextResponse.json({
      result: "ALREADY_VERIFIED", message: "This product has already been verified.",
      certificate: existingCert ? { publicId: existingCert.publicId, status: existingCert.status } : null
    });
  }

  await logVerificationEvent(serial._id, "VERIFIED", ipHash, userAgent, nonce);

  let certificate;
  let newClaimToken = null;
  try {
    const result = await processCertificateGeneration(serial._id, code, location);
    certificate = result.certificate;
    newClaimToken = result.rawClaimToken;
    console.log(`[VERIFY] certificate created: ${certificate.publicId}`);
    
    // Immediate acceleration trigger
    const workerUrl = getWorkerUrl(req);
    if (workerUrl) {
      console.log(`[VERIFY] scheduling immediate worker: ${workerUrl}`);
      after(() => {
        console.log(`[VERIFY] after callback started for VERIFIED`);
        fetch(workerUrl, { method: "POST", headers: { "Authorization": `Bearer ${process.env.INTERNAL_SERVICE_SECRET}` } })
          .then(r => console.log(`[VERIFY] worker response: ${r.status}`))
          .catch(err => console.error(`[VERIFY] worker trigger failed:`, err));
      });
    }
  } catch (err) {
    console.error("Initial certificate generation failed:", err);
    certificate = await Certificate.findOne({ serialId: serial._id });
  }

  return NextResponse.json({
    result: "VERIFIED", authentic: true, certificateAccess: true,
    message: "Your Eternal Glory product is verified as authentic!", verifiedAt: updated.verifiedAt,
    certificate: certificate ? { publicId: certificate.publicId, status: certificate.status, claimToken: newClaimToken } : null
  });
}

async function logVerificationEvent(serialId, result, ipHash, userAgent, requestId) {
  try { await VerificationEvent.create({ serialId: serialId || undefined, result, ipHash, userAgent: userAgent.slice(0, 256), requestId }); } catch (err) {}
}
