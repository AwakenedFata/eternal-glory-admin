import { MockAdapter } from "./providers/MockAdapter";
import { ShopeeAdapter } from "./providers/ShopeeAdapter";

const providers = {
  "MOCK": MockAdapter,
  "SHOPEE": ShopeeAdapter,
  // "TOKOPEDIA": TokopediaAdapter, // pending documentation
  // "TIKTOK": TikTokAdapter, // pending documentation
};

export function getProviderAdapter(providerName, integrationConfig) {
  const providerKey = providerName.toUpperCase();
  
  if (providerKey === "MOCK" && process.env.NODE_ENV === "production") {
    throw new Error("MOCK webhook provider is not allowed in production.");
  }

  const AdapterClass = providers[providerKey];
  if (!AdapterClass) {
    throw new Error(`Unsupported webhook provider: ${providerName}`);
  }
  return new AdapterClass(integrationConfig);
}
