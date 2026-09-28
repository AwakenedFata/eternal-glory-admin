/**
 * Internal provider-neutral representation of an Order.
 * Used by the WebhookProcessor to decouple from marketplace specifics.
 */
export class NormalizedOrder {
  /**
   * @param {Object} data
   * @param {string} data.provider - Marketplace provider (e.g., SHOPEE, TOKOPEDIA)
   * @param {string} data.storeExternalId - Provider's ID for the shop
   * @param {string} data.externalOrderId - Provider's internal order ID
   * @param {string} data.externalOrderNumber - Visible order number (e.g., 230915ABCD)
   * @param {string} data.orderStatus - Normalized status (e.g., PAID, SHIPPED)
   * @param {Date} [data.paidAt] - Timestamp when payment was confirmed
   * @param {string} [data.currency] - e.g., IDR
   * @param {Array<{externalItemId: string, sku: string, productId: string, productName: string, quantity: number}>} data.items - Items in the order
   */
  constructor(data) {
    this.provider = data.provider;
    this.storeExternalId = data.storeExternalId;
    this.externalOrderId = data.externalOrderId;
    this.externalOrderNumber = data.externalOrderNumber;
    this.orderStatus = data.orderStatus;
    this.providerOrderStatus = data.providerOrderStatus || data.orderStatus;
    this.paidAt = data.paidAt || null;
    this.currency = data.currency || null;
    this.items = data.items || [];
  }
}
