/**
 * Base class for marketplace provider adapters.
 * 
 * Each adapter is responsible for:
 * - Signature verification
 * - Event validation
 * - Event type mapping (to normalized types)
 * - Order normalization
 * - Item normalization
 * - Quantity extraction
 * - External event ID extraction
 * 
 * IMPORTANT: Do NOT invent actual provider payload formats.
 * Each concrete adapter should be implemented against the
 * provider's official documentation when accounts are available.
 */
export class BaseAdapter {
  constructor(integration) {
    this.integration = integration;
  }

  /**
   * Verify the webhook signature from the provider.
   * @param {Request} req - raw request
   * @param {string} rawBody - raw body string
   * @param {string} secret - decrypted webhook secret
   * @returns {boolean} whether signature is valid
   */
  verifySignature(req, rawBody, secret) {
    throw new Error("verifySignature not implemented");
  }

  /**
   * Extract the provider-specific event ID for idempotency.
   * @param {object} payload - parsed payload
   * @returns {string} external event ID
   */
  getExternalEventId(payload) {
    throw new Error("getExternalEventId not implemented");
  }

  /**
   * Determine the normalized event type.
   * @param {object} payload
   * @returns {string} e.g. "ORDER_CREATED", "ORDER_PAID", "ORDER_CANCELLED"
   */
  getEventType(payload) {
    throw new Error("getEventType not implemented");
  }

  /**
   * Check if this event type should trigger serial generation.
   * @param {string} eventType - normalized event type
   * @returns {boolean}
   */
  shouldGenerateSerials(eventType) {
    return eventType === "ORDER_PAID" || eventType === "ORDER_CREATED";
  }

  /**
   * Normalize the order into a standard structure.
   * @param {object} payload
   * @returns {{ externalOrderId: string, items: Array<{ providerProductId: string, sku: string, quantity: number }> }}
   */
  normalizeOrder(payload) {
    throw new Error("normalizeOrder not implemented");
  }

  /**
   * Create a safe snapshot of the payload for storage (no secrets).
   * @param {object} payload
   * @returns {object}
   */
  getSafeSnapshot(payload) {
    return { eventType: this.getEventType(payload) };
  }
}

/**
 * Generic adapter that accepts a simple, documented payload format.
 * Use this for testing or for custom integrations.
 * 
 * Expected payload:
 * {
 *   event_id: "unique-event-id",
 *   event_type: "ORDER_PAID",
 *   order: {
 *     order_id: "EXT-ORDER-123",
 *     items: [
 *       { product_id: "PROD-1", sku: "EG-HOODIE-BLACK-M", quantity: 2 }
 *     ]
 *   }
 * }
 * 
 * Signature: HMAC-SHA256 of raw body using webhook secret.
 * Header: X-Webhook-Signature
 */
export class GenericAdapter extends BaseAdapter {
  verifySignature(req, rawBody, secret) {
    const crypto = require("crypto");
    const signature = req.headers.get("x-webhook-signature");
    if (!signature) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  getExternalEventId(payload) {
    return payload.event_id;
  }

  getEventType(payload) {
    return payload.event_type || "UNKNOWN";
  }

  normalizeOrder(payload) {
    const order = payload.order || {};
    return {
      externalOrderId: order.order_id || "",
      items: (order.items || []).map((item) => ({
        providerProductId: item.product_id || "",
        sku: item.sku || "",
        quantity: item.quantity || 0,
      })),
    };
  }

  getSafeSnapshot(payload) {
    return {
      eventType: payload.event_type,
      orderId: payload.order?.order_id,
      itemCount: payload.order?.items?.length || 0,
    };
  }
}

/**
 * Shopee adapter stub.
 * Signature verification and payload parsing must be implemented
 * against Shopee's official Open Platform documentation.
 */
export class ShopeeAdapter extends BaseAdapter {
  verifySignature(req, rawBody, secret) {
    // TODO: Implement against Shopee's official signature scheme
    // Shopee typically uses HMAC-SHA256 with specific header/body concatenation
    console.warn("ShopeeAdapter.verifySignature: Not yet implemented against official docs");
    return false;
  }

  getExternalEventId(payload) {
    // Shopee's actual field name TBD from official docs
    return payload.shop_id + "_" + (payload.order_sn || payload.ordersn || "");
  }

  getEventType(payload) {
    // Shopee's actual event code mapping TBD
    return payload.code?.toString() || "UNKNOWN";
  }

  normalizeOrder(payload) {
    return { externalOrderId: "", items: [] };
  }
}

/**
 * Tokopedia adapter stub.
 */
export class TokopediaAdapter extends BaseAdapter {
  verifySignature(req, rawBody, secret) {
    console.warn("TokopediaAdapter.verifySignature: Not yet implemented against official docs");
    return false;
  }

  getExternalEventId(payload) {
    return payload.order_id || "";
  }

  getEventType(payload) {
    return payload.event || "UNKNOWN";
  }

  normalizeOrder(payload) {
    return { externalOrderId: "", items: [] };
  }
}

/**
 * TikTok Shop adapter stub.
 */
export class TikTokShopAdapter extends BaseAdapter {
  verifySignature(req, rawBody, secret) {
    console.warn("TikTokShopAdapter.verifySignature: Not yet implemented against official docs");
    return false;
  }

  getExternalEventId(payload) {
    return payload.event_id || "";
  }

  getEventType(payload) {
    return payload.type || "UNKNOWN";
  }

  normalizeOrder(payload) {
    return { externalOrderId: "", items: [] };
  }
}

/**
 * Blibli adapter stub.
 */
export class BlibliAdapter extends BaseAdapter {
  verifySignature(req, rawBody, secret) {
    console.warn("BlibliAdapter.verifySignature: Not yet implemented against official docs");
    return false;
  }

  getExternalEventId(payload) {
    return payload.eventId || "";
  }

  getEventType(payload) {
    return payload.eventType || "UNKNOWN";
  }

  normalizeOrder(payload) {
    return { externalOrderId: "", items: [] };
  }
}

// Registry
const ADAPTERS = {
  generic: GenericAdapter,
  shopee: ShopeeAdapter,
  tokopedia: TokopediaAdapter,
  tiktokshop: TikTokShopAdapter,
  blibli: BlibliAdapter,
};

export function getAdapter(provider, integration) {
  const AdapterClass = ADAPTERS[provider.toLowerCase()];
  if (!AdapterClass) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return new AdapterClass(integration);
}
