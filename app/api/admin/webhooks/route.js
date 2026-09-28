import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { StoreWebhookIntegration, Store } from "@/lib/db/models";
import crypto from "crypto";

export async function GET() {
  try {
    await dbConnect();
    const integrations = await StoreWebhookIntegration.find({})
      .populate("storeId", "name")
      .lean();

    return NextResponse.json(integrations);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await dbConnect();
    const data = await req.json();

    if (!data.provider || !data.storeId || !data.name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const endpointKey = crypto.randomBytes(16).toString("hex");

    const integration = await StoreWebhookIntegration.create({
      storeId: data.storeId,
      provider: data.provider,
      name: data.name,
      endpointKey,
      status: "NOT_CONFIGURED"
    });

    return NextResponse.json(integration);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
