import { NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/db/mongoose";
import { Serial, VerificationEvent, Certificate, Nonce } from "@/lib/db/models";
import { hashCode } from "@/lib/serial/service";
import { processCertificateGeneration } from "@/lib/certificates/service";

export async function POST(req) {
  // 1. Authenticate Internal Request (HMAC-SHA256)
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    console.error("INTERNAL_SERVICE_SECRET is missing");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const timestamp = req.headers.get("X-Internal-Timestamp");
  const nonce = req.headers.get("X-Internal-Nonce");
  const signature = req.headers.get("X-Internal-Signature");
  const userAgent = req.headers.get("user-agent") || "";

  if (!timestamp || !nonce || !signature) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check timestamp freshness (± 60 seconds)
  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 60000) {
    return NextResponse.json({ error: "Request expired" }, { status: 401 });
  }

  let bodyString;
  let body;
  try {
    bodyString = await req.text();
    body = JSON.parse(bodyString);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Verify HMAC Signature
  const method = "POST";
  const path = "/api/public/verify";
  const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');
  const canonicalString = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(canonicalString).digest('hex');

  // Constant-time comparison
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Invalid signature format" }, { status: 403 });
  }

  await dbConnect();

  // Replay Protection using Strict Nonce Model
  try {
    await Nonce.create({ nonce });
  } catch (err) {
    return NextResponse.json({ error: "Replay detected" }, { status: 403 });
  }

  const code = body.code;
  const claimToken = body.claimToken;
  
  const rawLocation = body.verificationContext?.location;
  if (!rawLocation || typeof rawLocation !== "object") {
    return NextResponse.json({ error: "Invalid location schema" }, { status: 400 });
  }
  
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
    resolvedAt: rawLocation.resolvedAt ? String(rawLocation.resolvedAt) : new Date().toISOString()
  };

  if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid serial number format" }, { status: 400 });
  }

  const codeHashValue = hashCode(code);
  const serial = await Serial.findOne({ codeHash: codeHashValue });

  // Use a constant ipHash for the internal authenticated path to skip rate limits 
  // since the Public App already handles rate limiting against the real browser IP.
  const ipHash = "internal-authenticated";

  if (!serial) {
    await logVerificationEvent(null, "INVALID", ipHash, userAgent, nonce);
    return NextResponse.json({ result: "INVALID", message: "Serial number not found." });
  }

  if (serial.status === "VOID") {
    await logVerificationEvent(serial._id, "INVALID", ipHash, userAgent, nonce);
    return NextResponse.json({ result: "INVALID", message: "Serial number not found." });
  }

  // ALREADY VERIFIED FLOW
  if (serial.status === "VERIFIED") {
    await logVerificationEvent(serial._id, "ALREADY_VERIFIED", ipHash, userAgent, nonce);

    let certificate = await Certificate.findOne({ serialId: serial._id });
    if (!certificate || certificate.status === "FAILED") {
      // Recovery path
      try {
        const result = await processCertificateGeneration(serial._id, code, location);
        certificate = result.certificate;
      } catch (err) {
        console.error("Certificate generation recovery failed:", err);
      }
    }

    let isAuthorized = false;
    if (certificate && certificate.claimTokenHash && claimToken) {
      const incomingHash = crypto.createHash("sha256").update(claimToken).digest("hex");
      if (incomingHash === certificate.claimTokenHash) {
        isAuthorized = true;
      }
    }

    return NextResponse.json({
      result: "ALREADY_VERIFIED",
      authentic: true,
      certificateAccess: isAuthorized,
      message: "This product has already been verified.",
      verifiedAt: serial.verifiedAt,
      certificate: (isAuthorized && certificate) ? {
        publicId: certificate.publicId,
        status: certificate.status,
        claimToken
      } : null
    });
  }

  // Mark as verified (atomic update)
  const updated = await Serial.findOneAndUpdate(
    { _id: serial._id, status: { $in: ["AVAILABLE", "ASSIGNED", "ALLOCATED"] } },
    { $set: { status: "VERIFIED", verifiedAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    await logVerificationEvent(serial._id, "ALREADY_VERIFIED", ipHash, userAgent, nonce);
    const existingCert = await Certificate.findOne({ serialId: serial._id });
    return NextResponse.json({
      result: "ALREADY_VERIFIED",
      message: "This product has already been verified.",
      certificate: existingCert ? { publicId: existingCert.publicId, status: existingCert.status } : null
    });
  }

  await logVerificationEvent(serial._id, "VERIFIED", ipHash, userAgent, nonce);

  // Generate certificate using the trusted location snapshot
  let certificate;
  let newClaimToken = null;
  try {
    const result = await processCertificateGeneration(serial._id, code, location);
    certificate = result.certificate;
    newClaimToken = result.rawClaimToken;
  } catch (err) {
    console.error("Initial certificate generation failed:", err);
    certificate = await Certificate.findOne({ serialId: serial._id });
  }

  return NextResponse.json({
    result: "VERIFIED",
    authentic: true,
    certificateAccess: true,
    message: "Your Eternal Glory product is verified as authentic!",
    verifiedAt: updated.verifiedAt,
    certificate: certificate ? {
      publicId: certificate.publicId,
      status: certificate.status,
      claimToken: newClaimToken
    } : null
  });
}

async function logVerificationEvent(serialId, result, ipHash, userAgent, requestId) {
  try {
    await VerificationEvent.create({
      serialId: serialId || undefined,
      result,
      ipHash,
      userAgent: userAgent.slice(0, 256),
      requestId,
    });
  } catch (err) {
    console.error("Failed to log verification event:", err);
  }
}
