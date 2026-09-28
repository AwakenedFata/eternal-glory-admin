import dbConnect from "@/lib/db/mongoose";
import { WebhookEvent, StoreWebhookIntegration } from "@/lib/db/models";
import { processWebhookOrder } from "./processor";
import crypto from "crypto";

// Maximum retries for transient errors
const MAX_RETRIES = 5;

// Base backoff in milliseconds (1 min, 5 min, 15 min, 30 min, 1 hr)
const RETRY_BACKOFF_MINUTES = [1, 5, 15, 30, 60];

/**
 * Processes queued webhook events. This function acts as a durable outbox worker.
 * It uses atomic findOneAndUpdate to claim a lease on an event.
 */
export async function processWebhookQueue() {
  await dbConnect();

  // Create a unique worker ID for this execution context
  const workerId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7);
  
  // We want to process events that are QUEUED, or FAILED but eligible for retry.
  // We also want to recover abandoned PROCESSING events (e.g., if a worker crashed)
  const now = new Date();
  
  const abandonTimeout = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
  
  const claimQuery = {
    $or: [
      { status: "QUEUED", nextRetryAt: { $lte: now } },
      { status: "FAILED", nextRetryAt: { $lte: now }, attemptCount: { $lt: MAX_RETRIES } },
      { status: "PROCESSING", lastAttemptAt: { $lt: abandonTimeout } } // Recover abandoned leases
    ]
  };

  // Find and claim one event
  const claimedEvent = await WebhookEvent.findOneAndUpdate(
    claimQuery,
    {
      $set: { 
        status: "PROCESSING",
        processingStartedAt: now,
        lastAttemptAt: now,
        workerId: workerId
      },
      $inc: { attemptCount: 1 }
    },
    { new: true, sort: { nextRetryAt: 1, createdAt: 1 } } // Process oldest eligible first
  ).populate("integrationId");

  if (!claimedEvent) {
    return { processed: 0, message: "No eligible events in queue" };
  }

  const integration = claimedEvent.integrationId;

  try {
    if (!integration) {
      throw new Error("Integration not found for WebhookEvent");
    }

    const provider = claimedEvent.provider.toUpperCase();
    const payload = claimedEvent.safePayloadSnapshot;

    let normalizedOrder;

    if (provider === "SHOPEE") {
      const { fetchShopeeOrderDetails } = await import("@/lib/webhooks/shopee/order-service");
      const { mapShopeeOrder } = await import("@/lib/webhooks/shopee/mapper");
      
      const ordersn = payload.data?.ordersn;
      if (!ordersn) {
        const err = new Error("Missing ordersn in Shopee payload");
        err.isTransient = false; // Permanent error
        throw err;
      }

      const orderDetails = await fetchShopeeOrderDetails(integration, ordersn);
      normalizedOrder = mapShopeeOrder(integration, orderDetails);
    } else {
      // Mock / Default fallback
      const { ProviderRegistry } = await import("./ProviderRegistry");
      const adapter = ProviderRegistry.getAdapter(provider.toLowerCase());
      if (!adapter) throw new Error(`Unknown provider: ${provider}`);
      normalizedOrder = adapter.normalizeOrder(payload);
    }

    // Hand over to the idempotent allocation processor
    const result = await processWebhookOrder(integration, normalizedOrder, claimedEvent._id);

    // Mark successful
    await WebhookEvent.findByIdAndUpdate(claimedEvent._id, {
      $set: {
        status: "PROCESSED",
        processedAt: new Date(),
        lastError: null,
        workerId: null
      }
    });

    return { processed: 1, success: true, eventId: claimedEvent._id, serials: result.serialCount };

  } catch (err) {
    console.error(`[Worker ${workerId}] Error processing webhook event ${claimedEvent._id}:`, err);
    
    // Classify error and apply retry policy
    const isTransient = err.isTransient !== false; // Default to transient unless explicitly permanent
    const attempt = claimedEvent.attemptCount;
    
    let nextStatus = "FAILED";
    let nextRetryAt = null;

    if (isTransient && attempt < MAX_RETRIES) {
      nextStatus = "QUEUED";
      const backoffMinutes = RETRY_BACKOFF_MINUTES[Math.min(attempt - 1, RETRY_BACKOFF_MINUTES.length - 1)];
      nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
    }

    await WebhookEvent.findByIdAndUpdate(claimedEvent._id, {
      $set: {
        status: nextStatus,
        lastError: err.message || "Unknown error",
        nextRetryAt: nextRetryAt,
        workerId: null
      }
    });

    return { processed: 1, success: false, eventId: claimedEvent._id, error: err.message, nextStatus };
  }
}
