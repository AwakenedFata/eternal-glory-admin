import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { StoreWebhookIntegration } from "@/lib/db/models";
import { ShopeeApiClient } from "@/lib/webhooks/shopee/client";
import { ShopeeTokenService } from "@/lib/webhooks/shopee/token-service";

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    
    const integration = await StoreWebhookIntegration.findById(id);
    if (!integration) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (integration.provider.toUpperCase() !== "SHOPEE") {
      return NextResponse.json({ error: "Provider test not implemented" }, { status: 501 });
    }

    // Attempt a real connection
    try {
      const config = integration.configuration || {};
      const partnerId = config.partnerId;
      const shopId = config.shopId;
      const partnerKey = ShopeeTokenService.getPartnerKey(integration);
      const accessToken = await ShopeeTokenService.getValidAccessToken(integration);

      if (!partnerId || !shopId || !partnerKey || !accessToken) {
        throw new Error("Missing credentials. Please configure them first.");
      }

      const client = new ShopeeApiClient({
        partnerId: parseInt(partnerId, 10),
        partnerKey,
        shopId: parseInt(shopId, 10),
        accessToken,
      });

      const startTime = Date.now();
      // Use a lightweight, safe API call to verify shop access (e.g., get_shop_info)
      // SOURCE: Shopee Open Platform v2.shop.get_shop_info
      await client.request("/api/v2/shop/get_shop_info", "GET");
      const latency = Date.now() - startTime;

      // Update integration state to ACTIVE since connection is verified
      integration.status = "ACTIVE";
      integration.lastSuccessAt = new Date();
      integration.lastConnectionTestAt = new Date();
      integration.lastConnectionLatencyMs = latency;
      integration.lastConnectionErrorCode = null;
      await integration.save();

      return NextResponse.json({ 
        success: true, 
        message: "Connection successful", 
        latencyMs: latency,
        status: "ACTIVE"
      });

    } catch (apiError) {
      // Mark as AUTH_ERROR or DEGRADED depending on error type
      const isAuthError = !apiError.isTransient || apiError.message.includes("auth") || apiError.message.includes("sign");
      integration.status = isAuthError ? "AUTH_ERROR" : "DEGRADED";
      integration.lastErrorAt = new Date();
      integration.lastConnectionTestAt = new Date();
      integration.lastConnectionErrorCode = apiError.message || "Unknown error";
      await integration.save();

      return NextResponse.json({ 
        success: false, 
        error: apiError.message,
        status: integration.status
      }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
