import { NextResponse } from "next/server";
import { processWebhookQueue } from "@/lib/webhooks/worker";

// Force dynamic execution since this relies on DB state, not cached rendering
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow more time for worker

/**
 * Endpoint to trigger the durable background worker.
 * In a real production environment, this should be hit by a Cron Job (e.g., Vercel Cron, EventBridge, or a local cron).
 * Security: For a public cron, you should add a secret token check here to prevent abuse.
 * However, since it only processes already enqueued jobs securely, the risk is mostly resource exhaustion.
 */
export async function POST(req) {
  try {
    const authHeader = req.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET || process.env.WEBHOOK_WORKER_SECRET;

    if (!expectedSecret) {
      return NextResponse.json({ error: "Worker secret not configured on server" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Process a batch of up to 10 events (MAX_JOBS_PER_RUN = 10)
    const MAX_JOBS_PER_RUN = 10;
    let processedCount = 0;
    let successCount = 0;
    let hasMore = true;
    const startTime = Date.now();
    const MAX_EXECUTION_TIME_MS = 45000; // 45 seconds max before safely terminating

    // Loop a few times to drain small queues sequentially
    for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
        console.warn(`[Worker] Halting gracefully after ${MAX_EXECUTION_TIME_MS}ms to avoid serverless timeout`);
        hasMore = true;
        break;
      }

      const result = await processWebhookQueue();
      if (result.processed === 0) {
        hasMore = false;
        break;
      }
      processedCount++;
      if (result.success) successCount++;
    }

    return NextResponse.json({
      message: "Worker executed",
      processed: processedCount,
      successes: successCount,
      hasMore,
    }, { status: 200 });

  } catch (error) {
    console.error("Worker trigger error:", error);
    return NextResponse.json({ error: "Failed to run worker", details: error.message }, { status: 500 });
  }
}
