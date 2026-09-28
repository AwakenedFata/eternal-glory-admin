import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { WebhookEvent } from "@/lib/db/models";

export async function POST(req, { params }) {
  try {
    const { id, eventId } = await params;
    await dbConnect();
    
    // We only retry FAILED events.
    // Changing status to QUEUED allows the durable worker to pick it up again.
    const event = await WebhookEvent.findOneAndUpdate(
      { 
        _id: eventId, 
        integrationId: id,
        status: "FAILED" 
      },
      {
        $set: {
          status: "QUEUED",
          nextRetryAt: new Date(), // Immediate eligibility
          lastError: "Manual Admin Retry"
        },
        $inc: { manualRetryCount: 1 }
      },
      { returnDocument: 'after' }
    );

    if (!event) {
      return NextResponse.json({ error: "Event not found or not in FAILED state" }, { status: 400 });
    }

    // Best-effort trigger of the outbox worker for faster processing.
    const workerSecret = process.env.CRON_SECRET || process.env.WEBHOOK_WORKER_SECRET;
    const headers = { "Content-Type": "application/json" };
    if (workerSecret) {
      headers["Authorization"] = `Bearer ${workerSecret}`;
    }

    fetch(`${req.nextUrl.origin}/api/admin/webhooks/worker`, { 
      method: "POST",
      headers,
      body: JSON.stringify({ trigger: true })
    }).catch(err => {
      // Ignore fetch errors, worker runs independently
    });

    return NextResponse.json({ success: true, message: "Event queued for retry" });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
