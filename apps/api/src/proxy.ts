import { NextResponse, type NextRequest } from "next/server";

/**
 * 跨域配置（Next.js 16 起 middleware 更名为 proxy）。
 *
 * C端(3000) 和 后台(3001) 现在是两个独立的站点，浏览器直接请求本服务时属于跨域，
 * 所以这里统一在 /api/* 上补 CORS 响应头，并处理预检请求 OPTIONS。
 *
 * 允许的来源可用环境变量 CORS_ORIGINS 覆盖（逗号分隔），例如：
 *   CORS_ORIGINS=https://shop.example.com,https://admin.example.com
 */
const DEFAULT_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ORIGINS, ...fromEnv]));
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const isAllowed = Boolean(origin && getAllowedOrigins().includes(origin));

  // 预检请求：直接返回 204，不进入业务路由
  if (request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    if (isAllowed && origin) {
      preflight.headers.set("Access-Control-Allow-Origin", origin);
      preflight.headers.set(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
      preflight.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      preflight.headers.set("Access-Control-Max-Age", "86400");
    }
    preflight.headers.set("Vary", "Origin");
    return preflight;
  }

  const response = NextResponse.next();
  if (isAllowed && origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }
  response.headers.set("Vary", "Origin");
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
