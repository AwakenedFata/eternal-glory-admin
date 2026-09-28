import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { SocialLink } from "@/lib/db/models";

// Public endpoint - no auth required
export async function GET() {
  await dbConnect();

  const socials = await SocialLink.find({ isActive: true })
    .sort({ sortOrder: 1 })
    .select("platform url sortOrder")
    .lean();

  return NextResponse.json({ data: socials }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
