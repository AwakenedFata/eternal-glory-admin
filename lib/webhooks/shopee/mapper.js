import { NormalizedOrder } from "../NormalizedOrder";

/**
 * Maps Shopee v2.order.get_order_detail response to our internal NormalizedOrder format.
 */
export function mapShopeeOrder(integration, shopeeOrder) {
  // SOURCE: Shopee Open Platform Official Documentation
  // SECTION: Order API - v2.order.get_order_detail response
  // EXPECTED FIELDS:
  // order_sn, order_status, pay_time, item_list (array)
  // item_list item fields: item_id, model_id, item_sku, model_sku, model_quantity_purchased (or item_quantity), item_name.

  const externalOrderId = shopeeOrder.order_sn;
  const storeExternalId = integration.configuration?.shopId?.toString();
  
  const shopeeStatus = shopeeOrder.order_status;
  
  // Is the order actually paid? Shopee API provides `pay_time` if payment is confirmed.
  // We use the presence of `pay_time` as the source of truth for paymentState = PAID.
  const paidAt = shopeeOrder.pay_time ? new Date(shopeeOrder.pay_time * 1000) : null;
  const paymentState = paidAt ? "PAID" : "PENDING";

  // According to business policy: if it's PAID, we can allocate a serial.
  // We also track the actual provider status for UI/Debugging.
  const isCancelled = ["IN_CANCEL", "CANCELLED"].includes(shopeeStatus);
  const normalizedStatus = isCancelled ? "CANCELLED" : paymentState;

  const order = new NormalizedOrder({
    provider: "SHOPEE",
    storeExternalId,
    externalOrderId,
    externalOrderNumber: externalOrderId,
    orderStatus: normalizedStatus, // High-level status (PAID/PENDING/CANCELLED)
    providerOrderStatus: shopeeStatus, // Keep exact Shopee string
    paidAt,
    items: [],
  });

  if (Array.isArray(shopeeOrder.item_list)) {
    shopeeOrder.item_list.forEach(item => {
      // Shopee items can have models (variations).
      // If model_id > 0, it's a variation. The variation SKU is model_sku.
      // Otherwise it's the main item_sku.
      const hasVariation = item.model_id && item.model_id > 0;
      
      const externalItemId = hasVariation 
        ? `${item.item_id}-${item.model_id}` 
        : item.item_id.toString();
        
      const sku = hasVariation ? item.model_sku : item.item_sku;
      const productId = item.item_id.toString();
      const productName = hasVariation 
        ? `${item.item_name} - ${item.model_name}` 
        : item.item_name;
        
      // Sometimes quantity is in model_quantity_purchased
      const quantity = item.model_quantity_purchased || item.item_quantity || 1;

      order.items.push({
        externalItemId,
        sku,
        productId,
        productName,
        quantity,
      });
    });
  }

  return order;
}
