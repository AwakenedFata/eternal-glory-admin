import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { Serial, Store, VerificationEvent } from "@/lib/db/models";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();

  const [
    totalSerials,
    availableSerials,
    allocatedSerials,
    verifiedSerials,
    voidSerials,
    activeStores,
    totalVerifications,
    recentVerifications,
  ] = await Promise.all([
    Serial.countDocuments(),
    Serial.countDocuments({ status: "AVAILABLE" }),
    Serial.countDocuments({ status: "ALLOCATED" }),
    Serial.countDocuments({ status: "VERIFIED" }),
    Serial.countDocuments({ status: "VOID" }),
    Store.countDocuments({ isActive: true }),
    VerificationEvent.countDocuments(),
    VerificationEvent.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);

  return NextResponse.json({
    totalSerials,
    availableSerials,
    allocatedSerials,
    verifiedSerials,
    voidSerials,
    activeStores,
    totalVerifications,
    recentVerifications,
  });
}
