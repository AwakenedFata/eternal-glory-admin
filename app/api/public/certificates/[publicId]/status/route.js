import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { Certificate } from "@/lib/db/models";
import { getCertificateSignedUrl } from "@/lib/certificates/storage";
import crypto from "crypto";

export async function GET(req, { params }) {
  const { publicId } = await params;

  if (!publicId) {
    return NextResponse.json({ error: "Missing publicId" }, { status: 400 });
  }

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

  // Auth: accept INTERNAL_SERVICE_SECRET (server-to-server) OR user claim token
  let isAuthorized = false;
  
  // Server-to-server auth via INTERNAL_SERVICE_SECRET
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
      status: certificate.status,
      previewUrl,
      downloadUrl
    }
  });
}
