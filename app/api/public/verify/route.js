import { NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/db/mongoose";
import { Serial, VerificationEvent, Certificate, Nonce } from "@/lib/db/models";
import { hashCode, decryptCode } from "@/lib/serial/service";
import { processCertificateGeneration, executeCertificateGenerationJob } from "@/lib/certificates/service";
import { v4 as uuidv4 } from "uuid";

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

  /**
   * INLINE WORKER: Run certificate generation directly inside after() callback.
   * 
   * Why not HTTP fetch to /api/worker/certificates?
   * - Vercel Hobby plan cron only runs once/day (fallback is useless)
   * - after() + fetch() to self is fragile (URL construction, auth, cold starts)
   * - Inline execution in after() is guaranteed by Vercel to complete
   * 
   * after() runs AFTER the response is sent to the client, so the user
   * gets an immediate response while PDF generation happens in background.
   */
  function scheduleInlineWorker(certificateId, serialCode, generationVersion) {
    const workerId = "INLINE-" + uuidv4();
    console.log(`[VERIFY] Scheduling inline worker ${workerId} for cert ${certificateId}`);
    
    after(async () => {
      try {
        console.log(`[VERIFY] Inline worker ${workerId} starting generation`);
        
        // Claim the job first (same as worker route does)
        await dbConnect();
        const job = await Certificate.findOneAndUpdate(
          {
            _id: certificateId,
            status: "PROCESSING",
            $or: [
              { workerId: null },
              { workerId: { $exists: false } }
            ]
          },
          {
            $set: {
              processingStartedAt: new Date(),
              workerId: workerId,
              lastAttemptAt: new Date()
            },
            $inc: { attemptCount: 1 }
          },
          { returnDocument: 'after' }
        );
        
        if (!job) {
          console.log(`[VERIFY] Inline worker: job already claimed or not found`);
          return;
        }
        
        const result = await executeCertificateGenerationJob(
          certificateId,
          serialCode,
          workerId,
          generationVersion
        );
        
        console.log(`[VERIFY] Inline worker result: ${JSON.stringify(result)}`);
      } catch (err) {
        console.error(`[VERIFY] Inline worker failed:`, err);
      }
    });
  }

  // ALREADY VERIFIED FLOW
  if (serial.status === "VERIFIED") {
    await logVerificationEvent(serial._id, "ALREADY_VERIFIED", ipHash, userAgent, nonce);
    let certificate = await Certificate.findOne({ serialId: serial._id });
    if (!certificate || certificate.status === "FAILED") {
      try {
        const result = await processCertificateGeneration(serial._id, code, location);
        certificate = result.certificate;
        scheduleInlineWorker(certificate._id, code, certificate.generationVersion || 1);
      } catch (err) {
        console.error("Certificate generation setup failed:", err);
      }
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
    
    // Schedule inline worker to generate PDF in background
    scheduleInlineWorker(certificate._id, code, certificate.generationVersion || 1);
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
