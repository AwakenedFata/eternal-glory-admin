import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { Store, AuditLog } from "@/lib/db/models";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const stores = await Store.find().sort({ sortOrder: 1 }).lean();
  return NextResponse.json({ data: stores });
}

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  // Validation
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!body.storeUrl || typeof body.storeUrl !== "string") {
    return NextResponse.json({ error: "Store URL is required" }, { status: 400 });
  }

  const store = await Store.create({
    name: body.name.trim(),
    mark: body.mark?.trim() || "",
    logoUrl: body.logoUrl || "",
    storeUrl: body.storeUrl.trim(),
    sortOrder: body.sortOrder ?? 0,
    isActive: body.isActive !== false,
  });

  await AuditLog.create({
    adminEmail: session.user.email,
    action: "CREATE_STORE",
    targetType: "STORE",
    targetId: store._id.toString(),
    metadata: { name: store.name },
  });

  return NextResponse.json({ data: store }, { status: 201 });
}

export async function PUT(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (!body.id) {
    return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
  }

  const updateData = {};
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.mark !== undefined) updateData.mark = body.mark.trim();
  if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl;
  if (body.storeUrl !== undefined) updateData.storeUrl = body.storeUrl.trim();
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const store = await Store.findByIdAndUpdate(body.id, { $set: updateData }, { returnDocument: 'after' });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  await AuditLog.create({
    adminEmail: session.user.email,
    action: body.isActive === false ? "DISABLE_STORE" : "UPDATE_STORE",
    targetType: "STORE",
    targetId: store._id.toString(),
    metadata: { changes: Object.keys(updateData) },
  });

  return NextResponse.json({ data: store });
}
