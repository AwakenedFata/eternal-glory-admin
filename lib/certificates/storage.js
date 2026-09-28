import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

const s3Client = process.env.S3_BUCKET_NAME
  ? new S3Client({
    region: process.env.S3_REGION || "ap-southeast-2",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  })
  : null;

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const LOCAL_STORAGE_PATH = path.join(process.cwd(), "public", "certificates");

if (!s3Client) {
  if (!fs.existsSync(LOCAL_STORAGE_PATH)) {
    fs.mkdirSync(LOCAL_STORAGE_PATH, { recursive: true });
  }
}

/**
 * @param {string} publicId
 * @param {Buffer} pdfBuffer
 * @returns {string} 
 */
export async function uploadCertificatePDF(publicId, pdfBuffer) {
  const objectKey = `certificates/${publicId}.pdf`;

  if (s3Client) {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    });
    await s3Client.send(command);
  } else {
    const filePath = path.join(LOCAL_STORAGE_PATH, `${publicId}.pdf`);
    fs.writeFileSync(filePath, pdfBuffer);
  }

  return objectKey;
}

/**
 * @param {string} objectKey
 * @param {number} expiresIn 
 * @returns {string} 2
 */
export async function getCertificateSignedUrl(objectKey, asAttachment = false, expiresIn = 300) {
  if (s3Client) {
    const params = {
      Bucket: BUCKET_NAME,
      Key: objectKey,
    };
    if (asAttachment) {
      params.ResponseContentDisposition = 'attachment; filename="Eternal-Glory-Certificate.pdf"';
    }
    const command = new GetObjectCommand(params);
    return await getSignedUrl(s3Client, command, { expiresIn });
  } else {
    const publicId = objectKey.replace("certificates/", "").replace(".pdf", "");
    return `${process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001"}/certificates/${publicId}.pdf${asAttachment ? "?download=1" : ""}`;
  }
}
