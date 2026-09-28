import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { SocialLink, AuditLog } from "@/lib/db/models";

const ALLOWED_PLATFORMS = ["instagram", "tiktok", "threads", "x", "facebook", "pinterest"];

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const socials = await SocialLink.find().sort({ sortOrder: 1 }).lean();
  return NextResponse.json({ data: socials });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (!body.platform || !ALLOWED_PLATFORMS.includes(body.platform)) {
    return NextResponse.json({ error: `Platform must be one of: ${ALLOWED_PLATFORMS.join(", ")}` }, { status: 400 });
  }
  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  if (!body.url.startsWith("https://")) {
    return NextResponse.json({ error: "URL must start with https://" }, { status: 400 });
  }

  // Check if platform already exists
  const existing = await SocialLink.findOne({ platform: body.platform });
  if (existing) {
    return NextResponse.json({ error: `${body.platform} already exists. Use edit instead.` }, { status: 409 });
  }

  const social = await SocialLink.create({
    platform: body.platform,
    url: body.url.trim(),
    sortOrder: body.sortOrder ?? 0,
    isActive: body.isActive !== false,
  });

  await AuditLog.create({
    adminEmail: session.user.email,
    action: "CREATE_SOCIAL",
    targetType: "SOCIAL_LINK",
    targetId: social._id.toString(),
    metadata: { platform: social.platform },
  });

  return NextResponse.json({ data: social }, { status: 201 });
}

export async function PUT(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (!body.id) return NextResponse.json({ error: "Social link ID is required" }, { status: 400 });

  const updateData = {};
  if (body.url !== undefined) {
    if (!body.url.startsWith("https://")) {
      return NextResponse.json({ error: "URL must start with https://" }, { status: 400 });
    }
    updateData.url = body.url.trim();
  }
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const social = await SocialLink.findByIdAndUpdate(body.id, { $set: updateData }, { returnDocument: 'after' });
  if (!social) return NextResponse.json({ error: "Social link not found" }, { status: 404 });

  await AuditLog.create({
    adminEmail: session.user.email,
    action: "UPDATE_SOCIAL",
    targetType: "SOCIAL_LINK",
    targetId: social._id.toString(),
    metadata: { changes: Object.keys(updateData) },
  });

  return NextResponse.json({ data: social });
}
