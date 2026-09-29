import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { Certificate, Serial, AuditLog, VerificationEvent } from "@/lib/db/models";
import { processCertificateGeneration } from "@/lib/certificates/service";
import { getCertificateSignedUrl } from "@/lib/certificates/storage";

async function logAudit(action, userId, targetType, targetId, metadata = {}) {
  try {
    await AuditLog.create({ action, adminId: userId, targetType, targetId, metadata });
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { id } = await params;

  await dbConnect();

  const certificate = await Certificate.findById(id)
    .populate({
      path: "serialId",
      populate: { path: "storeId" }
    })
    .lean();

  if (!certificate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get verification stats
  const verificationEvents = await VerificationEvent.find({ serialId: certificate.serialId._id })
    .sort({ createdAt: -1 })
    .lean();

  const successfulVerifications = verificationEvents.filter(e => e.result === "ALREADY_VERIFIED" || e.result === "VERIFIED").length;
  const failedAttempts = verificationEvents.filter(e => e.result === "INVALID").length;
  const firstVerified = verificationEvents.reverse().find(e => e.result === "VERIFIED")?.createdAt;
  const lastAttempt = verificationEvents.length > 0 ? verificationEvents[0].createdAt : null;

  let downloadUrl = null;
  if (certificate.status === "READY" && certificate.pdfObjectKey) {
    downloadUrl = await getCertificateSignedUrl(certificate.pdfObjectKey);
  }

  return NextResponse.json({
    success: true,
    data: {
      ...certificate,
      downloadUrl,
      stats: {
        successfulVerifications,
        failedAttempts,
        firstVerified,
        lastAttempt,
        totalEvents: verificationEvents.length
      },
      events: verificationEvents.slice(0, 50) // last 50 events
    }
  });
}

export async function POST(req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action } = await req.json();

  await dbConnect();
  
  const certificate = await Certificate.findById(id).populate("serialId");
  if (!certificate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "regenerate") {
    try {
      if (!certificate.serialId || !certificate.serialId.encryptedCode) {
        return NextResponse.json({ error: "Serial data not available for regeneration." }, { status: 400 });
      }

      // If a worker is currently processing this certificate, we must
      // invalidate it by incrementing generationVersion. The running
      // worker's fencing check will fail when it tries to finalize.
      if (certificate.status === "PROCESSING" && certificate.workerId) {
        console.warn(`[Regeneration] Certificate ${id} is currently being processed by worker ${certificate.workerId}. Invalidating via generationVersion bump.`);
      }

      // Archive the current generation metadata before overwriting
      if (certificate.pdfObjectKey) {
        certificate.generationHistory.push({
          templateVersion: certificate.templateVersion,
          pdfObjectKey: certificate.pdfObjectKey,
          pdfSha256: certificate.pdfSha256,
          fileSize: certificate.fileSize,
          generatedAt: certificate.generatedAt,
          generatedBy: session.user.email,
          reason: "Manual regeneration by admin"
        });
      }

      // INCREMENT generationVersion -- this is the fencing token.
      // Any running worker with the old version will be unable to finalize.
      // Use atomic findOneAndUpdate with $inc to prevent generationVersion race conditions
      const updatedCert = await Certificate.findOneAndUpdate(
        { _id: certificate._id },
        {
          $inc: { generationVersion: 1 },
          $set: {
            status: "PROCESSING",
            workerId: null,
            attemptCount: 0,
            nextRetryAt: new Date(), // Immediately eligible
            lastError: null
          }
        },
        { returnDocument: 'after' } // Return the updated document
      );
      
      // Update our local reference to reflect the atomic changes
      Object.assign(certificate, updatedCert);

      // Trigger background worker acceleration (fire and forget)
      // Use the request's own origin to construct the worker URL,
      // so this works in both dev (localhost:3001) and production.
      try {
        const workerUrl = new URL("/api/worker/certificates", req.url).toString();
        fetch(workerUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.INTERNAL_SERVICE_SECRET}` }
        }).catch(err => console.error("Worker trigger failed:", err));
      } catch (urlErr) {
        console.error("Failed to construct worker URL:", urlErr);
      }

      await logAudit(
        "CERTIFICATE_REGENERATE",
        session.user.id,
        "Certificate",
        certificate._id,
        { publicId: certificate.publicId, previousSha256: certificate.pdfSha256, newGenerationVersion: certificate.generationVersion }
      );

      return NextResponse.json({ success: true, certificate });
    } catch (err) {
      console.error("Regeneration failed:", err);
      return NextResponse.json({ error: "Regeneration failed: " + err.message }, { status: 500 });
    }
  }

  if (action === "revoke") {
    certificate.status = "REVOKED";
    await certificate.save();
    
    await AuditLog.create({
      adminEmail: session.user.email,
      action: "REVOKE_CERTIFICATE",
      targetType: "Certificate",
      targetId: certificate._id,
    });

    return NextResponse.json({ success: true, status: "REVOKED" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
