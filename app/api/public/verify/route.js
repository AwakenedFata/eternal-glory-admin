import { NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/db/mongoose";
import { Serial, VerificationEvent, Certificate } from "@/lib/db/models";
import { hashCode } from "@/lib/serial/service";
import { hashIP, checkRateLimit, checkInvalidThrottle, recordInvalidAttempt } from "@/lib/security/rate-limit";
import { processCertificateGeneration } from "@/lib/certificates/service";
import { geolocateIP } from "@/lib/geolocation/service";
import { getClientIp } from "@/lib/geolocation/get-client-ip";

export async function POST(req) {
  const ip = getClientIp(req);
  const ipHash = hashIP(ip);
  const userAgent = req.headers.get("user-agent") || "";
  const requestId = crypto.randomUUID();
  const location = await geolocateIP(ip);

  // Rate limit check
  const rateCheck = await checkRateLimit(ipHash);
  if (!rateCheck.allowed) {
    await logVerificationEvent(null, "RATE_LIMITED", ipHash, userAgent, requestId);
    return NextResponse.json(
      { result: "RATE_LIMITED", message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  // Invalid attempt throttle check
  const throttleCheck = await checkInvalidThrottle(ipHash);
  if (throttleCheck.blocked) {
    await logVerificationEvent(null, "RATE_LIMITED", ipHash, userAgent, requestId);
    return NextResponse.json(
      { result: "RATE_LIMITED", message: "Too many invalid attempts. Please try again later." },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const code = body.code;
  const claimToken = body.claimToken;

  if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Invalid serial number format" }, { status: 400 });
  }

  await dbConnect();

  const codeHashValue = hashCode(code);
  const serial = await Serial.findOne({ codeHash: codeHashValue });

  if (!serial) {
    await recordInvalidAttempt(ipHash);
    await logVerificationEvent(null, "INVALID", ipHash, userAgent, requestId);
    return NextResponse.json({ result: "INVALID", message: "Serial number not found." });
  }

  if (serial.status === "VOID") {
    await recordInvalidAttempt(ipHash);
    await logVerificationEvent(serial._id, "INVALID", ipHash, userAgent, requestId);
    return NextResponse.json({ result: "INVALID", message: "Serial number not found." });
  }

  // ALREADY VERIFIED FLOW
  if (serial.status === "VERIFIED") {
    await logVerificationEvent(serial._id, "ALREADY_VERIFIED", ipHash, userAgent, requestId);

    let certificate = await Certificate.findOne({ serialId: serial._id });
    if (!certificate || certificate.status === "FAILED") {
      // Recovery path if certificate failed or didn't generate during initial verification
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
        claimToken // Send back the raw token they just sent us to re-save if needed
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
    // Concurrent verification
    await logVerificationEvent(serial._id, "ALREADY_VERIFIED", ipHash, userAgent, requestId);
    const existingCert = await Certificate.findOne({ serialId: serial._id });
    return NextResponse.json({
      result: "ALREADY_VERIFIED",
      message: "This product has already been verified.",
      certificate: existingCert ? { publicId: existingCert.publicId, status: existingCert.status } : null
    });
  }

  await logVerificationEvent(serial._id, "VERIFIED", ipHash, userAgent, requestId);

  // Generate certificate
  let certificate;
  let newClaimToken = null;
  try {
    const result = await processCertificateGeneration(serial._id, code, location);
    certificate = result.certificate;
    newClaimToken = result.rawClaimToken;
  } catch (err) {
    console.error("Initial certificate generation failed:", err);
    // Continue despite error, the user shouldn't be blocked from knowing their serial is valid
    // The certificate status will be FAILED and can be retried
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
      claimToken: newClaimToken // Return the newly generated one
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
