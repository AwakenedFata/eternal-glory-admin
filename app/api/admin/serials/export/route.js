import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { Serial } from "@/lib/db/models";
import { decryptCode } from "@/lib/serial/service";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const query = {};
  if (status) query.status = status;

  const serials = await Serial.find(query)
    .sort({ createdAt: -1 })
    .limit(50000)
    .lean();

  // Build CSV
  const rows = ["code,status,source,generatedAt,allocatedAt,verifiedAt"];
  for (const s of serials) {
    const plainCode = decryptCode(s.encryptedCode) || "DECRYPTION_FAILED";
    rows.push([
      plainCode,
      s.status,
      s.source,
      s.generatedAt?.toISOString() || "",
      s.allocatedAt?.toISOString() || "",
      s.verifiedAt?.toISOString() || "",
    ].join(","));
  }

  const csv = rows.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="serials_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
