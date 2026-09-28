import dbConnect from "@/lib/db/mongoose";
import { WebhookEvent, ProductRule } from "@/lib/db/models";
import { generateWebhookSerials } from "@/lib/serial/service";

/**
 * Process a normalized order from a webhook event.
 * Handles serial generation based on product rules, with idempotency.
 */
export async function processWebhookOrder(integration, normalizedOrder, webhookEventId) {
  await dbConnect();

  // Load the WebhookEvent to ensure it's still PROCESSING
  const event = await WebhookEvent.findById(webhookEventId);
  if (!event || event.status !== "PROCESSING") {
    throw new Error("Invalid webhook event state for processing");
  }

  const { externalOrderId, items } = normalizedOrder;
  let totalGenerated = 0;
  const allGeneratedSerialIds = [];

  try {
    for (const item of items) {
      // Find product rule for this item
      const rule = await ProductRule.findOne({
        integrationId: integration._id,
        $or: [
          { providerProductId: item.externalItemId },
          { sku: item.sku },
        ],
        isEligible: true,
      });

      if (!rule) {
        // No rule or not eligible -> skip
        continue;
      }

      const totalSerials = item.quantity * rule.serialsPerUnit;
      
      if (totalSerials > 0) {
        const inserted = await generateWebhookSerials({
          quantity: totalSerials,
          storeId: integration.storeId,
          externalOrderId,
          orderItemId: item.externalItemId,
          channel: "MARKETPLACE",
          provider: integration.provider,
          orderRef: normalizedOrder.externalOrderNumber || externalOrderId,
          integrationId: integration._id,
          productId: item.productId || item.externalItemId,
          sku: item.sku,
          serialsPerUnit: rule.serialsPerUnit
        });
        
        totalGenerated += inserted.length;
        allGeneratedSerialIds.push(...inserted.map(s => s._id));
      }
    }

    event.status = "PROCESSED";
    event.processedAt = new Date();
    await event.save();

    // Also update the integration lastSuccessAt
    integration.lastSuccessAt = new Date();
    await integration.save();

    return {
      success: true,
      serialCount: totalGenerated,
      serialIds: allGeneratedSerialIds,
    };
  } catch (err) {
    event.status = "FAILED";
    event.errorMessage = err.message;
    await event.save();
    
    integration.lastErrorAt = new Date();
    await integration.save();
    
    throw err;
  }
}
