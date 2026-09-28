import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/mongoose";
import { ProductRule } from "@/lib/db/models";

export async function DELETE(req, { params }) {
  try {
    const { id, ruleId } = await params;
    await dbConnect();
    
    const result = await ProductRule.findOneAndDelete({
      _id: ruleId,
      integrationId: id
    });

    if (!result) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
