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

/**
 * 开发环境额外放行的私有网段来源。
 * 手机 / 同事电脑通过局域网 IP 访问时，来源是 http://192.168.x.x:3000 这类地址，
 * 没法预先写进白名单，所以开发环境按私有网段放行；生产环境仍然只认 CORS_ORIGINS。
 */
const PRIVATE_ORIGIN_PATTERN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?$/;

function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ORIGINS, ...fromEnv]));
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (getAllowedOrigins().includes(origin)) return true;
  if (process.env.NODE_ENV !== "production" && PRIVATE_ORIGIN_PATTERN.test(origin)) {
    return true;
  }
  return false;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const isAllowed = isOriginAllowed(origin);

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
