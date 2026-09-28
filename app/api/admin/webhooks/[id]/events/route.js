import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { WebhookEvent } from "@/lib/db/models";

import { redactSensitiveData } from "@/lib/utils/redact";

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    
    // Pagination params
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    
    const events = await WebhookEvent.find({ integrationId: id })
      .sort({ receivedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await WebhookEvent.countDocuments({ integrationId: id });

    // Redact safePayloadSnapshot fields just in case legacy unredacted events exist
    const redactedEvents = events.map(evt => {
      evt.safePayloadSnapshot = redactSensitiveData(evt.safePayloadSnapshot);
      return evt;
    });

    return NextResponse.json({
      events: redactedEvents,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
