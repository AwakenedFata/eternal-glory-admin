import crypto from "crypto";

// We require dbConnect and StoreWebhookIntegration model to persist tokens
// This service assumes `integration.configuration` stores the encrypted secrets.
// In a real app, use a strong key from process.env.ENCRYPTION_KEY
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex"); // 32 bytes for aes-256-cbc. fallback is unsafe for prod restarts

/**
 * Symmetric encryption for storing tokens at rest.
 */
function encryptText(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptText(text) {
  if (!text) return text;
  const textParts = text.split(":");
  if (textParts.length !== 2) return text; // Probably not encrypted
  const iv = Buffer.from(textParts[0], "hex");
  const encryptedText = Buffer.from(textParts[1], "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

/**
 * Service to manage Shopee API tokens
 */
export class ShopeeTokenService {
  /**
   * Encrypts and updates the tokens on an integration object.
   * Note: This modifies the integration object but DOES NOT call `.save()`.
   */
  static setTokens(integration, { accessToken, refreshToken, expireInSeconds }) {
    if (!integration.configuration) {
      integration.configuration = {};
    }

    integration.configuration.accessTokenEncrypted = encryptText(accessToken);
    if (refreshToken) {
      integration.configuration.refreshTokenEncrypted = encryptText(refreshToken);
    }
    
    if (expireInSeconds) {
      // Shopee access tokens expire in typically 10000 seconds
      // We buffer by 5 minutes to avoid race conditions
      const bufferSeconds = 300; 
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + (expireInSeconds - bufferSeconds));
      integration.configuration.tokenExpiresAt = expiryDate;
    }
  }

  /**
   * Retrieves the decrypted access token.
   * If the token is expired, in a real implementation this should call the Shopee refresh token API,
   * then update the database. 
   */
  static async getValidAccessToken(integration) {
    const config = integration.configuration || {};
    
    // Check expiration
    if (config.tokenExpiresAt && new Date() > new Date(config.tokenExpiresAt)) {
      // Token is expired. 
      // SOURCE: Shopee Open Platform Official Documentation
      // CLAIM: You must use the refresh token API `/api/v2/auth/access_token/get` to get a new token.
      throw new Error("PENDING OFFICIAL VERIFICATION: Shopee access token is expired. Refresh token flow needs to be implemented via v2.auth.access_token.get API.");
      
      // return await this.refreshAccessToken(integration);
    }

    return decryptText(config.accessTokenEncrypted);
  }

  static getPartnerKey(integration) {
    return decryptText(integration.configuration?.partnerKeyEncrypted);
  }

  static setPartnerKey(integration, partnerKey) {
    if (!integration.configuration) {
      integration.configuration = {};
    }
    integration.configuration.partnerKeyEncrypted = encryptText(partnerKey);
  }
}
