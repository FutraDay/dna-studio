import { NextResponse } from "next/server";
import { revokeMobileToken } from "@/lib/mobile/auth";

export async function POST(request: Request) {
  try {
    await revokeMobileToken(request);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
