import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { StoreWebhookIntegration, WebhookEvent } from "@/lib/db/models";

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    
    const integration = await StoreWebhookIntegration.findById(id).lean();
    if (!integration) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const totalEvents = await WebhookEvent.countDocuments({ integrationId: id });
    const pendingEvents = await WebhookEvent.countDocuments({ 
      integrationId: id, 
      status: { $in: ["RECEIVED", "QUEUED", "PROCESSING"] } 
    });
    const failedEvents = await WebhookEvent.countDocuments({ 
      integrationId: id, 
      status: "FAILED" 
    });
    const processedEvents = await WebhookEvent.countDocuments({ 
      integrationId: id, 
      status: "PROCESSED" 
    });

    return NextResponse.json({
      status: integration.status,
      apiHealth: {
        lastSuccessAt: integration.lastSuccessAt,
        lastErrorAt: integration.lastErrorAt,
      },
      webhookHealth: {
        lastEventAt: integration.lastEventAt,
        totalEvents,
        pendingEvents,
        failedEvents,
        processedEvents
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
