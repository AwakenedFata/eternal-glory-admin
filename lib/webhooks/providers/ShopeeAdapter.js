import crypto from "crypto";
import { MarketplaceAdapter } from "../MarketplaceAdapter";

/**
 * Shopee Webhook Adapter
 * Based on official Shopee Open Platform Push Mechanism.
 */
export class ShopeeAdapter extends MarketplaceAdapter {
  constructor(integration) {
    super(integration);
    // Integration configuration should contain the partner_key
    this.partnerKey = integration.configuration?.partnerKey;
  }

  async verifyRequest(req, rawBody, secret) {
    // SOURCE: Shopee Open Platform Push Mechanism documentation
    // SECTION: Signature Verification
    // CLAIM: Signature Base String is `url|body` concatenated with a pipe character.
    // HMAC-SHA256 hex string provided in `Authorization` header.

    const signature = req.headers.get("authorization");
    if (!signature) return false;

    const partnerKeyToUse = secret || this.partnerKey;
    if (!partnerKeyToUse) throw new Error("Missing Shopee Partner Key for signature verification");

    // The current official specification requires the full callback URL configured in the console.
    // We assume `req.url` matches exactly what was registered.
    // If reverse proxies alter the URL, this might require a configured base URL.
    const url = req.url; 
    const hmacUrlAndBody = crypto.createHmac("sha256", partnerKeyToUse).update(`${url}|${rawBody}`).digest("hex");

    // We use timingSafeEqual to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    
    let isValid = false;
    try {
      if (Buffer.from(hmacUrlAndBody).equals(sigBuffer)) isValid = true;
    } catch (err) {
      return false;
    }

    return isValid;
  }

  getEventId(payload) {
    // There is no explicit `event_id` in the Shopee push payload. 
    // We use a composite of ordersn + status + timestamp to ensure uniqueness.
    // SOURCE: Shopee Payload Schema
    if (!payload.data || !payload.data.ordersn) return null;
    return `${payload.data.ordersn}-${payload.data.status}-${payload.timestamp}`;
  }

  getEventType(payload) {
    // Shopee uses numeric codes. Code 3 = order_status_push
    return `code_${payload.code}_${payload.data?.status || "UNKNOWN"}`;
  }

  getIdempotencyKey(payload) {
    return this.getEventId(payload);
  }

  isOrderPaidEvent(payload) {
    // Typically in Shopee, PROCESSED or READY_TO_SHIP means payment is secured (except for COD, which might need special handling)
    // For now we check if status is PROCESSED.
    // PENDING OFFICIAL VERIFICATION: Exact payment status strings.
    return payload.code === 3 && payload.data?.status === "PROCESSED";
  }

  normalizeOrder(payload) {
    // SOURCE: Shopee Push Mechanism Documentation
    // SECTION: Payload Structure
    // CLAIM: The `order_status_push` payload does NOT contain detailed items (items: []). 
    // It only contains: { data: { ordersn, status, update_time, items: [] }, code, shop_id, timestamp }
    // A secondary API call to `v2.order.get_order_details` is REQUIRED to fetch SKUs and Quantities.
    
    throw new Error("PENDING OFFICIAL VERIFICATION: Cannot normalize Shopee order from webhook payload alone. Required items array is empty. A secondary API call to getOrderDetails is required.");
  }
}
