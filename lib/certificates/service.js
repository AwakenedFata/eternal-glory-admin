import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import dbConnect from "@/lib/db/mongoose";
import { Certificate, Serial } from "@/lib/db/models";
import { generateCertificatePDF } from "./generator";
import { uploadCertificatePDF } from "./storage";

/**
 * Handles the generation of a certificate for a verified serial.
 * Designed to be idempotent.
 *
 * @param {string} serialId - ObjectId of the Serial
 * @param {string} serialCode - Plaintext serial code for the PDF
 * @param {Date} [purchaseDate] - Optional purchase date
 * @returns {Promise<Object>} Certificate record
 */
export async function processCertificateGeneration(serialId, serialCode, location = null, purchaseDate = null) {
  await dbConnect();

  // 1. Check if certificate already exists
  let certificate = await Certificate.findOne({ serialId });
  let claimToken = null;

  if (certificate) {
    if (certificate.status === "READY") {
      return { certificate, rawClaimToken: null }; // Already fully generated
    }
    // If PROCESSING or FAILED, we can retry generation
  } else {
    // 2. Create initial record
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
        purchaseDate,
        location,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Race condition: another request created it just now
        certificate = await Certificate.findOne({ serialId });
        if (certificate.status === "READY") return { certificate, rawClaimToken: null };
      } else {
        throw err;
      }
    }
  }

  // 3. Generate PDF Buffer
  try {
    const { pdfBuffer, pdfSha256, fileSize } = await generateCertificatePDF(
      serialCode,
      certificate.publicId,
      certificate.issuedAt,
      certificate.location
    );

    // 4. Upload to Object Storage
    const objectKey = await uploadCertificatePDF(certificate.publicId, pdfBuffer);

    // 5. Mark as READY
    certificate.pdfObjectKey = objectKey;
    certificate.pdfSha256 = pdfSha256;
    certificate.fileSize = fileSize;
    certificate.status = "READY";
    certificate.generatedAt = new Date();
    await certificate.save();

    return { certificate, rawClaimToken: claimToken || null };
  } catch (error) {
    console.error("Certificate generation failed:", error);
    // Mark as FAILED but don't delete it
    certificate.status = "FAILED";
    await certificate.save();

    // We do NOT throw here if we just created it, because we MUST return the rawClaimToken
    // to the caller so the user doesn't lose access to their certificate page.
    return { certificate, rawClaimToken: claimToken || null, error };
  }
}
