import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { StoreWebhookIntegration } from "@/lib/db/models";
import { ShopeeTokenService } from "@/lib/webhooks/shopee/token-service";
import crypto from "crypto";

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const integration = await StoreWebhookIntegration.findById(id)
      .populate("storeId", "name")
      .lean();

    if (!integration) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Sanitize output - NEVER send raw secrets back to the frontend
    if (integration.configuration) {
      // Mask tokens if they exist (they are encrypted, but we still mask them)
      if (integration.configuration.accessTokenEncrypted) {
        integration.configuration.hasAccessToken = true;
      }
      if (integration.configuration.refreshTokenEncrypted) {
        integration.configuration.hasRefreshToken = true;
      }
      if (integration.configuration.partnerKeyEncrypted) {
        integration.configuration.hasPartnerKey = true;
      }
      
      // Delete encrypted strings from response
      delete integration.configuration.accessTokenEncrypted;
      delete integration.configuration.refreshTokenEncrypted;
      delete integration.configuration.partnerKeyEncrypted;
    }

    return NextResponse.json(integration);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const data = await req.json();

    const integration = await StoreWebhookIntegration.findById(id);
    if (!integration) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Update basic fields
    if (data.name) integration.name = data.name;
    if (data.status) integration.status = data.status;

    // Handle provider-specific config (Shopee)
    if (integration.provider.toUpperCase() === "SHOPEE" && data.configuration) {
      if (!integration.configuration) integration.configuration = {};
      
      const conf = data.configuration;
      if (conf.partnerId) integration.configuration.partnerId = conf.partnerId;
      if (conf.shopId) integration.configuration.shopId = conf.shopId;
      
      // Handle secrets securely
      if (conf.partnerKey) {
        ShopeeTokenService.setPartnerKey(integration, conf.partnerKey);
      }
      
      if (conf.accessToken) {
        ShopeeTokenService.setTokens(integration, {
          accessToken: conf.accessToken,
          refreshToken: conf.refreshToken,
          expireInSeconds: conf.expireInSeconds || 10000
        });
      }

      // Mark as configured if we have the minimum requirements, but NOT ACTIVE yet (needs Test)
      if (integration.configuration.partnerId && integration.configuration.partnerKeyEncrypted && integration.configuration.accessTokenEncrypted) {
        integration.status = "CONFIGURED";
      }
    }

    // Mongoose Mixed types need marking as modified
    integration.markModified('configuration');
    await integration.save();

    return NextResponse.json({ success: true, status: integration.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
