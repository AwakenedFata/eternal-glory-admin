import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { Serial, AuditLog } from "@/lib/db/models";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (!body.id) return NextResponse.json({ error: "Serial ID required" }, { status: 400 });

  const serial = await Serial.findOneAndUpdate(
    { _id: body.id, status: { $ne: "VOID" } },
    { $set: { status: "VOID", voidedAt: new Date() } },
    { new: true }
  );

  if (!serial) return NextResponse.json({ error: "Serial not found or already voided" }, { status: 404 });

  await AuditLog.create({
    adminEmail: session.user.email,
    action: "VOID_SERIAL",
    targetType: "SERIAL",
    targetId: serial._id.toString(),
  });

  return NextResponse.json({ success: true });
}
