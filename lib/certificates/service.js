import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import dbConnect from "@/lib/db/mongoose";
import { Certificate, Serial } from "@/lib/db/models";
import { generateCertificatePDF } from "./generator";
import { uploadCertificatePDF } from "./storage";

const MAX_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MINUTES = 60;

/**
 * Handles the creation of a certificate record in PROCESSING state.
 * Returns immediately without generating the PDF.
 *
 * This function is idempotent:
 * - If a certificate already exists and is READY, it returns it.
 * - If a certificate already exists and is PROCESSING/FAILED, it returns it
 *   (the worker will pick it up).
 * - If no certificate exists, it creates one with generationVersion = 1.
 * - Duplicate key errors (race between two concurrent VERIFY calls) are
 *   handled gracefully via the unique index on serialId.
 */
export async function processCertificateGeneration(serialId, serialCode, location = null, purchaseDate = null) {
  await dbConnect();

  let certificate = await Certificate.findOne({ serialId });
  let claimToken = null;

  if (certificate) {
    if (certificate.status === "READY") {
      return { certificate, rawClaimToken: null };
    }
    // Certificate exists but is PROCESSING or FAILED -- return it as-is.
    // The worker will handle it.
    return { certificate, rawClaimToken: null };
  }

  // No certificate exists -- create one.
  const publicId = crypto.randomUUID ? crypto.randomUUID() : uuidv4();
  claimToken = crypto.randomBytes(32).toString("hex");
  const claimTokenHash = crypto.createHash("sha256").update(claimToken).digest("hex");

  try {
    certificate = await Certificate.create({
      publicId,
      serialId,
      claimTokenHash,
      status: "PROCESSING",
      issuedAt: new Date(),
      issuedTimezone: location?.timeZone || undefined,
      purchaseDate,
      location,
      generationVersion: 1,
      nextRetryAt: new Date(), // Immediately eligible for worker pickup
    });
  } catch (err) {
    if (err.code === 11000) {
      // Another concurrent VERIFY call already created this certificate.
      certificate = await Certificate.findOne({ serialId });
      if (certificate.status === "READY") return { certificate, rawClaimToken: null };
      return { certificate, rawClaimToken: null };
    }
    throw err;
  }

  return { certificate, rawClaimToken: claimToken };
}

/**
 * Worker function to execute the PDF generation job for a given certificate.
 *
 * FENCING CONTRACT:
 * This function receives the workerId and generationVersion that were captured
 * at claim time. Before finalizing (writing READY), it performs an atomic
 * conditional update that verifies:
 *
 *   1. status is still PROCESSING         -> not already finalized or revoked
 *   2. workerId still matches             -> lease was not reclaimed by another worker
 *   3. generationVersion still matches    -> no admin regeneration happened
 *
 * If any of these conditions fail, modifiedCount = 0, and we discard our result.
 * The orphaned versioned artifact in storage can be cleaned up by lifecycle
 * policies or a periodic cleanup job.
 *
 * STORAGE STRATEGY:
 * PDFs are uploaded to a versioned key: certificates/${publicId}-v${version}.pdf
 * Only after the atomic fencing check passes does the DB record point to this key.
 * This prevents a stale worker from overwriting a newer generation's artifact.
 */
export async function executeCertificateGenerationJob(certificateId, serialCode, workerId, generationVersion) {
  await dbConnect();

  // Pre-check: if already READY or REVOKED, skip.
  const certificate = await Certificate.findById(certificateId).lean();
  if (!certificate) {
    return { success: false, reason: "Certificate not found" };
  }
  if (certificate.status === "READY" || certificate.status === "REVOKED") {
    return { success: true, reason: `Already ${certificate.status}` };
  }
  // If generation version has moved past ours, we are stale -- abort before
  // spending resources on Chromium.
  if (certificate.generationVersion && certificate.generationVersion > generationVersion) {
    console.warn(`[Fencing] Worker ${workerId} has stale generationVersion ${generationVersion}, current is ${certificate.generationVersion}. Aborting before generation.`);
    return { success: false, reason: "Stale generation version (pre-generation check)" };
  }

  try {
    // Generate the PDF using the certificate's own metadata
    const { pdfBuffer, pdfSha256, fileSize } = await generateCertificatePDF(
      serialCode,
      certificate.publicId,
      certificate.issuedAt,
      certificate.location,
      certificate.issuedTimezone
    );

    // Upload to VERSIONED key -- not the bare publicId key.
    // This ensures a stale worker cannot overwrite a newer generation's artifact.
    // Key format: certificates/${publicId}-v${generationVersion}.pdf
    const objectKey = await uploadCertificatePDF(
      certificate.publicId,
      pdfBuffer,
      generationVersion
    );

    // ═══════════════════════════════════════════════════════════════════
    // ATOMIC FENCING CHECK -- THE CORE OF GENERATION SAFETY
    // ═══════════════════════════════════════════════════════════════════
    //
    // This is the ONLY place where a worker is allowed to transition
    // a certificate to READY. The filter ensures:
    //
    //   status = PROCESSING         -> not already finalized or revoked
    //   workerId = our workerId     -> lease not reclaimed
    //   generationVersion = ours    -> no regeneration happened
    //
    // If ANY condition fails, modifiedCount = 0, and we discard our result.
    const fencingResult = await Certificate.updateOne(
      {
        _id: certificateId,
        status: "PROCESSING",
        workerId: workerId,
        generationVersion: generationVersion
      },
      {
        $set: {
          pdfObjectKey: objectKey,
          pdfSha256: pdfSha256,
          fileSize: fileSize,
          status: "READY",
          generatedAt: new Date(),
          workerId: null,
          lastError: null,
          nextRetryAt: null
        }
      }
    );

    if (fencingResult.modifiedCount === 0) {
      console.warn(
        `[Fencing] Worker ${workerId} BLOCKED from finalizing certificate ${certificateId}. ` +
        `generationVersion=${generationVersion}. Result discarded. ` +
        `Orphaned artifact: ${objectKey}`
      );
      return { success: false, reason: "Fencing check failed -- stale worker" };
    }

    console.log(`[Worker] Certificate ${certificateId} generation v${generationVersion} finalized by ${workerId}`);
    return { success: true };

  } catch (error) {
    console.error(`[Worker] Certificate ${certificateId} generation failed:`, error.message);

    // FENCED ERROR HANDLING:
    // Even the error handler must respect fencing. A stale worker must not
    // overwrite the status of a certificate that has been reclaimed or
    // regenerated by another worker/admin.
    const errorResult = await Certificate.findOneAndUpdate(
      {
        _id: certificateId,
        workerId: workerId,
        generationVersion: generationVersion,
        status: "PROCESSING" // Don't overwrite READY/REVOKED
      },
      {
        $set: {
          lastError: error.message?.substring(0, 500) || "Unknown error",
          workerId: null
        }
      },
      { returnDocument: 'after' }
    );

    if (errorResult) {
      // Determine if we should keep it retryable or mark as permanent failure
      const currentAttempts = errorResult.attemptCount || 0;
      if (currentAttempts >= MAX_ATTEMPTS) {
        errorResult.status = "FAILED";
        errorResult.nextRetryAt = null; // Permanent failure, requires manual intervention
      } else {
        // Keep as PROCESSING for automatic retry with bounded exponential backoff
        const retryDelay = Math.min(Math.pow(2, currentAttempts), MAX_RETRY_DELAY_MINUTES);
        errorResult.nextRetryAt = new Date(Date.now() + retryDelay * 60000);
      }
      await errorResult.save();
    } else {
      console.warn(`[Fencing] Stale worker ${workerId} could not record error for ${certificateId}. Another worker or regeneration has taken over.`);
    }

    return { success: false, error };
  }
}
