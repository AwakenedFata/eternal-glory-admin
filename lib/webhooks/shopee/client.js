import { signShopApiRequest, signPublicApiRequest } from "./signer";

const SHOPEE_API_HOST = process.env.SHOPEE_ENV === "production" 
  ? "https://partner.shopeemobile.com"
  : "https://partner.test-stable.shopeemobile.com"; // Sandbox fallback

/**
 * Common HTTP client for Shopee Open API v2
 * Responsibilities:
 * - Constructing the final URL with signed query parameters
 * - Sending requests with timeout
 * - Error parsing and response validation
 */
export class ShopeeApiClient {
  constructor({ partnerId, partnerKey, shopId, accessToken }) {
    this.partnerId = partnerId;
    this.partnerKey = partnerKey;
    this.shopId = shopId;
    this.accessToken = accessToken;
    this.host = SHOPEE_API_HOST;
  }

  /**
   * Make an authenticated Shop API request.
   */
  async request(apiPath, method = "GET", payload = null) {
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Sign the request
    const sign = signShopApiRequest({
      partnerId: this.partnerId,
      partnerKey: this.partnerKey,
      apiPath,
      accessToken: this.accessToken,
      shopId: this.shopId,
      timestamp,
    });

    // Build the query string
    const queryParams = new URLSearchParams({
      partner_id: this.partnerId,
      timestamp,
      access_token: this.accessToken,
      shop_id: this.shopId,
      sign,
    });

    const url = `${this.host}${apiPath}?${queryParams.toString()}`;

    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (payload && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(payload);
    }

    // Network timeout to prevent hanging worker jobs (e.g., 10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    options.signal = controller.signal;

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      // We expect Shopee to return 200 OK even for business errors, but handle HTTP errors just in case
      if (!response.ok) {
        throw new Error(`Shopee API HTTP Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Shopee API v2 usually returns an empty string or null error if successful.
      // E.g., { "error": "", "message": "", "response": { ... } }
      if (data.error && data.error.length > 0) {
        // Evaluate permanent vs transient errors based on error code
        const isTransient = this._isTransientError(data.error);
        const err = new Error(`Shopee API Error: ${data.error} - ${data.message}`);
        err.isTransient = isTransient;
        err.shopeeErrorData = data;
        throw err;
      }

      return data.response;
    } catch (err) {
      clearTimeout(timeoutId);
      
      // AbortError is a network timeout (transient)
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Shopee API request timed out after 10s (${apiPath})`);
        timeoutErr.isTransient = true;
        throw timeoutErr;
      }

      // If it doesn't already have a transient flag, assume it's transient network failure
      if (err.isTransient === undefined) {
        err.isTransient = true;
      }
      
      throw err;
    }
  }

  _isTransientError(errorString) {
    // Basic heuristics for Shopee Error codes
    // SOURCE: Shopee Error Code Documentation
    const permanentErrors = [
      "error_auth", 
      "error_param", 
      "invalid_sign", 
      "invalid_access_token",
      "no_permission"
    ];
    
    // If it's a known auth or bad request error, it's permanent.
    if (permanentErrors.some(e => errorString.includes(e))) {
      return false;
    }
    
    // Server errors or unknown errors are transient
    return true;
  }
}
