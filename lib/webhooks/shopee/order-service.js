import { ShopeeApiClient } from "./client";

/**
 * Service to fetch authoritative order details from Shopee API v2.
 */
export async function fetchShopeeOrderDetails(integration, ordersn) {
  // We need to fetch the credentials from the integration config
  const { partnerId, partnerKey, shopId, accessToken } = integration.configuration || {};

  if (!partnerId || !partnerKey || !shopId || !accessToken) {
    const err = new Error("Integration is missing required Shopee API credentials (partnerId, partnerKey, shopId, or accessToken).");
    err.isTransient = false; // Configuration issue, retrying won't help without user intervention
    throw err;
  }

  const client = new ShopeeApiClient({
    partnerId: parseInt(partnerId, 10),
    partnerKey,
    shopId: parseInt(shopId, 10),
    accessToken,
  });

  // SOURCE: Shopee Open Platform Official Documentation
  // SECTION: Order API - v2.order.get_order_detail
  // Payload expects order_sn_list (array of order_sn)
  // response.order_list will contain the details including item_list.
  
  // We can request specific response fields to optimize data transfer if documented,
  // but by default we need at least: order_sn, order_status, pay_time, item_list.
  const queryParams = new URLSearchParams({
    order_sn_list: ordersn,
    response_optional_fields: "item_list,pay_time", 
  });
  
  const apiPath = "/api/v2/order/get_order_detail";

  // Note: get_order_detail is a GET request according to most v2 documentations
  // Some docs show it as GET with query params, others as POST. Assuming GET with query.
  // Actually, standard is GET with query strings. Let's use GET.
  const fullPath = `${apiPath}?${queryParams.toString()}`;

  const response = await client.request(fullPath, "GET");

  if (!response || !response.order_list || response.order_list.length === 0) {
    const err = new Error(`Shopee Order ${ordersn} not found via get_order_detail API.`);
    err.isTransient = false;
    throw err;
  }

  return response.order_list[0];
}
