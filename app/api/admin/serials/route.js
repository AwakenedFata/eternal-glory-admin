import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { Serial, AuditLog } from "@/lib/db/models";
import { generateSingleSerial, generateBatchSerials, decryptCode } from "@/lib/serial/service";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const status = searchParams.get("status");
  const source = searchParams.get("source");

  const query = {};
  if (status) query.status = status;
  if (source) query.source = source;

  const total = await Serial.countDocuments(query);
  const serials = await Serial.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("storeId", "name")
    .lean();

  // Decrypt codes for the admin UI table as requested by user
  const exposedSerials = serials.map(s => {
    let plainCode = "ERROR";
    try {
      plainCode = decryptCode(s.encryptedCode);
    } catch (err) {
      console.error("Failed to decrypt serial:", err);
    }

    return {
      ...s,
      encryptedCode: undefined, // remove encrypted payload from response
      codeHash: undefined, // remove hash
      code: plainCode,
    };
  });

  return NextResponse.json({
    data: exposedSerials,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit)
    }
  });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (body.action === "generate_single") {
    try {
      const result = await generateSingleSerial("MANUAL_SINGLE");
      await AuditLog.create({
        adminEmail: session.user.email,
        action: "GENERATE_SINGLE_SERIAL",
        targetType: "SERIAL",
        targetId: result.serial._id.toString(),
      });
      return NextResponse.json({ success: true, plainCode: result.plainCode });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (body.action === "generate_batch") {
    const quantity = parseInt(body.quantity);
    if (isNaN(quantity) || quantity < 1 || quantity > 10000) {
      return NextResponse.json({ error: "Invalid quantity (1 - 10000)" }, { status: 400 });
    }

    try {
      const result = await generateBatchSerials(quantity, "MANUAL_BATCH");
      await AuditLog.create({
        adminEmail: session.user.email,
        action: "GENERATE_BATCH_SERIAL",
        targetType: "SERIAL",
        metadata: { requested: quantity, generated: result.generated },
      });
      return NextResponse.json({ success: true, result });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (body.action === "assign") {
    const { serialId, reference } = body;
    if (!serialId || !reference) {
      return NextResponse.json({ error: "Missing serialId or reference" }, { status: 400 });
    }

    try {
      const serial = await Serial.findById(serialId);
      if (!serial) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (serial.status !== "AVAILABLE") {
        return NextResponse.json({ error: `Cannot assign serial with status ${serial.status}` }, { status: 400 });
      }

      serial.status = "ASSIGNED";
      serial.assignedToRef = reference; // Legacy
      serial.assignment = {
        channel: "MANUAL",
        orderRef: reference,
        assignedAt: new Date(),
        assignedBy: session.user.email
      };
      serial.assignedAt = new Date(); // Legacy
      await serial.save();

      await AuditLog.create({
        adminEmail: session.user.email,
        action: "ASSIGN_SERIAL",
        targetType: "SERIAL",
        targetId: serial._id.toString(),
        metadata: { reference },
      });
      return NextResponse.json({ success: true });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
