import crypto from "crypto";

/**
 * SOURCE: Shopee Open Platform Official Documentation
 * SECTION: API v2 Authentication (Shop API)
 * CLAIM: Signature base string format is `partner_id + api_path + timestamp + access_token + shop_id`.
 * Algorithm is HMAC-SHA256 hashed with partner_key, resulting in hex-encoded lowercase string.
 */
export function signShopApiRequest({ partnerId, partnerKey, apiPath, accessToken, shopId, timestamp }) {
  if (!partnerId || !partnerKey || !apiPath || !accessToken || !shopId || !timestamp) {
    throw new Error("Missing required parameters for Shopee Shop API signature");
  }

  // Strictly follow official concatenation order:
  // partner_id + api_path + timestamp + access_token + shop_id
  const baseString = `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`;
  
  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}

/**
 * SOURCE: Shopee Open Platform Official Documentation
 * SECTION: API v2 Authentication (Public API)
 * CLAIM: Signature base string format is `partner_id + api_path + timestamp`.
 */
export function signPublicApiRequest({ partnerId, partnerKey, apiPath, timestamp }) {
  if (!partnerId || !partnerKey || !apiPath || !timestamp) {
    throw new Error("Missing required parameters for Shopee Public API signature");
  }

  const baseString = `${partnerId}${apiPath}${timestamp}`;
  
  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}
