import { MarketplaceAdapter } from "../MarketplaceAdapter";
import { NormalizedOrder } from "../NormalizedOrder";

export class MockAdapter extends MarketplaceAdapter {
  async verifyRequest(req, rawBody) {
    // In mock, we can just say it's valid if there's some header or just true
    return true;
  }

  getEventId(payload) {
    return payload.mockEventId || Date.now().toString();
  }

  getEventType(payload) {
    return payload.mockEventType || "ORDER_PAID";
  }

  getIdempotencyKey(payload) {
    return this.getEventId(payload);
  }

  isOrderPaidEvent(payload) {
    return this.getEventType(payload) === "ORDER_PAID";
  }

  normalizeOrder(payload) {
    const { order } = payload;
    
    if (!order) throw new Error("Missing order payload");

    return new NormalizedOrder({
      provider: "MOCK",
      storeExternalId: payload.storeId || "MOCK_STORE",
      externalOrderId: order.id,
      externalOrderNumber: order.orderNumber,
      orderStatus: "PAID",
      paidAt: new Date(),
      currency: order.currency || "IDR",
      items: (order.items || []).map(item => ({
        externalItemId: item.id,
        sku: item.sku,
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity
      }))
    });
  }
}
