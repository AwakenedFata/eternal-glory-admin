import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { ProductRule } from "@/lib/db/models";

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const rules = await ProductRule.find({ integrationId: id }).lean();
    return NextResponse.json(rules);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    await dbConnect();
    const data = await req.json();

    if (!data.providerProductId) {
      return NextResponse.json({ error: "Provider Product ID is required" }, { status: 400 });
    }

    const serialsPerUnit = Number(data.serialsPerUnit);
    if (!Number.isInteger(serialsPerUnit) || serialsPerUnit < 1 || !Number.isFinite(serialsPerUnit)) {
      return NextResponse.json({ error: "serialsPerUnit must be a finite integer >= 1" }, { status: 400 });
    }

    const rule = await ProductRule.findOneAndUpdate(
      { integrationId: id, providerProductId: data.providerProductId },
      {
        $set: {
          sku: data.sku,
          isEligible: data.isEligible !== false,
          serialsPerUnit: serialsPerUnit
        }
      },
      { new: true, upsert: true }
    );

    return NextResponse.json(rule);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
