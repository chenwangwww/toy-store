import { NextResponse } from "next/server";

/** 健康检查：C端/后台/运维都可以用它确认后端是否存活 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "toy-store-api",
    time: new Date().toISOString(),
  });
}
