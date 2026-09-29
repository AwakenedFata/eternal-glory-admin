import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "@/lib/db/mongoose";
import { Certificate, Serial } from "@/lib/db/models";
import { executeCertificateGenerationJob } from "@/lib/certificates/service";
import { decryptCode } from "@/lib/serial/service";

export const maxDuration = 300; // Allow 5 minutes on Vercel for batch generation

const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function processBatch(workerId) {
  await dbConnect();
  const batchSize = 5;
  let processed = 0;
  let successful = 0;

  try {
    while (processed < batchSize) {
      const now = new Date();
      const leaseExpiry = new Date(now.getTime() - LEASE_DURATION_MS);

      const job = await Certificate.findOneAndUpdate(
        {
          status: { $in: ["PROCESSING", "FAILED"] },
          $and: [
            {
              $or: [
                { nextRetryAt: { $exists: false } },
                { nextRetryAt: null },
                { nextRetryAt: { $lte: now } }
              ]
            },
            {
              $or: [
                { workerId: null },
                { workerId: { $exists: false } },
                { processingStartedAt: { $lt: leaseExpiry } }
              ]
            }
          ],
          $expr: { $lt: [{ $ifNull: ["$attemptCount", 0] }, MAX_ATTEMPTS] }
        },
        {
          $set: {
            processingStartedAt: now,
            workerId: workerId,
            lastAttemptAt: now
          },
          $inc: { attemptCount: 1 }
        },
        { returnDocument: 'after' }
      );

      if (!job) break;

      processed++;

      const claimedGenerationVersion = job.generationVersion || 1;

      const serial = await Serial.findById(job.serialId);
      if (!serial || !serial.encryptedCode) {
        await Certificate.updateOne(
          { _id: job._id, workerId: workerId, generationVersion: claimedGenerationVersion },
          { $set: { status: "FAILED", lastError: "Serial or encryptedCode not found", workerId: null, nextRetryAt: null } }
        );
        continue;
      }

      const serialCode = decryptCode(serial.encryptedCode);
      if (!serialCode) {
        await Certificate.updateOne(
          { _id: job._id, workerId: workerId, generationVersion: claimedGenerationVersion },
          { $set: { status: "FAILED", lastError: "Failed to decrypt serial code", workerId: null, nextRetryAt: null } }
        );
        continue;
      }

      const result = await executeCertificateGenerationJob(
        job._id,
        serialCode,
        workerId,
        claimedGenerationVersion
      );
      if (result.success) {
        successful++;
      }
    }
  } catch (error) {
    console.error("Worker batch error:", error);
    throw error;
  }

  return { processed, successful };
}

// Used by internal Immediate Invocation trigger (App/Admin)
export async function POST(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.INTERNAL_SERVICE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = uuidv4();
  try {
    const result = await processBatch(workerId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: "Worker encountered an error", details: err.message }, { status: 500 });
  }
}

// Used by Vercel Cron
export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = "CRON-" + uuidv4();
  console.log(`[${new Date().toISOString()}] Vercel Cron Invoked Worker: ${workerId}`);

  try {
    const result = await processBatch(workerId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: "Worker encountered an error", details: err.message }, { status: 500 });
  }
}
