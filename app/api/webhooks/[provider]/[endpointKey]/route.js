import { NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/db/mongoose";
import { StoreWebhookIntegration, WebhookEvent } from "@/lib/db/models";
import { getProviderAdapter } from "@/lib/webhooks/ProviderRegistry";
import { processWebhookOrder } from "@/lib/webhooks/processor";
import { decryptCode } from "@/lib/serial/service";
import { redactSensitiveData } from "@/lib/utils/redact";

// Decrypt webhook secret for signature verification
function decryptSecret(encryptedSecret) {
  // Uses the same encryption as serial codes
  return decryptCode(encryptedSecret);
}

export async function POST(req, { params }) {
  const { provider, endpointKey } = await params;

  await dbConnect();

  // 1. Find integration by endpointKey
  const integration = await StoreWebhookIntegration.findOne({
    provider: provider.toUpperCase(),
    endpointKey,
  });

  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  // 2. Check active
  if (!integration.isActive) {
    return NextResponse.json({ error: "Integration is disabled" }, { status: 403 });
  }

  // 3. Read raw body
  const rawBody = await req.text();
  let payload;
  
  // 4. Get adapter
  let adapter;
  try {
    adapter = getProviderAdapter(provider, integration);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  // 5. Verify signature
  const secret = integration.encryptedSecret ? decryptSecret(integration.encryptedSecret) : null;
  if (secret) {
    try {
      const valid = await adapter.verifyRequest(req, rawBody, secret);
      if (!valid) {
        throw new Error("Invalid signature");
      }
    } catch (err) {
      await StoreWebhookIntegration.findByIdAndUpdate(integration._id, {
        $set: { lastEventAt: new Date(), lastErrorAt: new Date() },
      });
      return NextResponse.json({ error: "Invalid signature or request" }, { status: 401 });
    }
  }

  // 6. Parse event
  try {
    payload = adapter.parseEvent(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON or Payload" }, { status: 400 });
  }

  // 7. Extract event details
  const externalEventId = adapter.getEventId(payload);
  const idempotencyKey = adapter.getIdempotencyKey(payload);
  const eventType = adapter.getEventType(payload);
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  if (!externalEventId || !idempotencyKey) {
    return NextResponse.json({ error: "Missing event ID or Idempotency Key" }, { status: 400 });
  }

  // 8. Idempotency check - try to create event, catch duplicate
  let webhookEvent;
  try {
    webhookEvent = await WebhookEvent.create({
      integrationId: integration._id,
      provider: provider.toUpperCase(),
      externalEventId,
      idempotencyKey,
      eventType,
      receivedAt: new Date(),
      status: "RECEIVED",
      payloadHash,
      safePayloadSnapshot: redactSensitiveData(payload), // Recursively redacts PII/tokens
    });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate event found, check its state for retry eligibility
      webhookEvent = await WebhookEvent.findOne({
        integrationId: integration._id,
        idempotencyKey,
      });

      if (!webhookEvent) {
        return NextResponse.json({ error: "Idempotency collision error" }, { status: 500 });
      }

      if (webhookEvent.status === "PROCESSED" || webhookEvent.status === "IGNORED") {
        return NextResponse.json({ status: "already_processed" }, { status: 200 });
      }

      if (webhookEvent.status === "PROCESSING") {
        const timeoutMs = 5 * 60 * 1000; // 5 minutes
        const isAbandoned = new Date() - new Date(webhookEvent.lastAttemptAt || webhookEvent.updatedAt) > timeoutMs;
        if (!isAbandoned) {
          return NextResponse.json({ status: "processing" }, { status: 429 }); // Still processing
        }
      }
      
      // If FAILED, or abandoned PROCESSING, allow retry.
    } else {
      throw err;
    }
  }

  // 9. Check if this event type should trigger serial generation
  if (!adapter.isOrderPaidEvent(payload)) {
    await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
      $set: { status: "IGNORED", processedAt: new Date() },
    });
    await StoreWebhookIntegration.findByIdAndUpdate(integration._id, {
      $set: { lastEventAt: new Date(), lastSuccessAt: new Date() },
    });
    return NextResponse.json({ status: "ignored", eventType });
  }

  // 10. Durable Queue (Outbox Pattern)
  // We ACK quickly to the provider and set status to QUEUED.
  // A separate durable background worker will claim the lease and process it.
  try {
    const queuedEvent = await WebhookEvent.findOneAndUpdate(
      { 
        _id: webhookEvent._id, 
        status: { $in: ["RECEIVED", "FAILED", "IGNORED"] } 
      },
      {
        $set: { 
          status: "QUEUED",
          nextRetryAt: new Date(), // Immediate process eligibility
        },
      },
      { new: true }
    );

    if (queuedEvent) {
      // Best-effort trigger of the outbox worker for faster processing.
      // If this fails or aborts, the Cron/worker will still pick it up durably based on QUEUED status.
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
    }

    return NextResponse.json({ status: "received", message: "Enqueued durably" }, { status: 200 });
  } catch (err) {
    console.error("Webhook route error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
