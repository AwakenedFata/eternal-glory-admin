import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { Store } from "@/lib/db/models";

// Public endpoint - no auth required
// Returns only public-safe fields
export async function GET() {
  await dbConnect();

  const stores = await Store.find({ isActive: true })
    .sort({ sortOrder: 1 })
    .select("name mark logoUrl storeUrl sortOrder")
    .lean();

  // Allow CORS from public frontend
  return NextResponse.json({ data: stores }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
