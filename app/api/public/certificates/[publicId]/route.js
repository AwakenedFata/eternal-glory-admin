import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { Certificate, CertificateAccessEvent } from "@/lib/db/models";
import { getCertificateSignedUrl } from "@/lib/certificates/storage";
import crypto from "crypto";

export async function GET(req, { params }) {
  const { publicId } = await params;

  if (!publicId) {
    return NextResponse.json({ error: "Missing publicId" }, { status: 400 });
  }

  // Expect Bearer token
  const authHeader = req.headers.get("authorization");
  let incomingToken = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    incomingToken = authHeader.substring(7);
  }

  await dbConnect();

  const certificate = await Certificate.findOne({ publicId });

  if (!certificate) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  const ipHash = req.headers.get("x-forwarded-for") || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  const requestId = crypto.randomUUID();

  // Validate Token: accept INTERNAL_SERVICE_SECRET or user claim token
  let isAuthorized = false;
  
  // Server-to-server auth
  if (incomingToken && incomingToken === process.env.INTERNAL_SERVICE_SECRET) {
    isAuthorized = true;
  }
  
  // User claim token auth
  if (!isAuthorized && certificate.claimTokenHash && incomingToken) {
    const incomingHash = crypto.createHash("sha256").update(incomingToken).digest("hex");
    if (incomingHash === certificate.claimTokenHash) {
      isAuthorized = true;
    }
  }

  // Create Access Event
  await CertificateAccessEvent.create({
    certificateId: certificate._id,
    publicId: certificate.publicId,
    action: "VIEW_REQUESTED",
    authorizationResult: isAuthorized ? "GRANTED" : "DENIED",
    ipHash,
    userAgent,
    requestId
  });

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized access to certificate" }, { status: 403 });
  }

  let previewUrl = null;
  let downloadUrl = null;
  if (certificate.status === "READY" && certificate.pdfObjectKey) {
    previewUrl = await getCertificateSignedUrl(certificate.pdfObjectKey, false);
    downloadUrl = await getCertificateSignedUrl(certificate.pdfObjectKey, true);
  }

  return NextResponse.json({
    success: true,
    certificate: {
      publicId: certificate.publicId,
      status: certificate.status,
      issuedAt: certificate.issuedAt,
      templateVersion: certificate.templateVersion,
      previewUrl,
      downloadUrl,
    }
  });
}
