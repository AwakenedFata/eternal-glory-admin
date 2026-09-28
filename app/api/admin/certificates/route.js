import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { Certificate, Serial, Store } from "@/lib/db/models";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const status = searchParams.get("status");

  const filter = {};
  if (status && status !== "all") {
    filter.status = status;
  }

  const certificates = await Certificate.find(filter)
    .populate({
      path: "serialId",
      select: "source storeId orderId externalOrderId status",
      populate: { path: "storeId", select: "name" }
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
    
  const total = await Certificate.countDocuments(filter);

  return NextResponse.json({
    success: true,
    data: certificates,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}
