import path from "node:path";
import type { NextConfig } from "next";

/**
 * 允许通过局域网 IP / 自定义域名访问 dev server。
 * Next 默认只放行 localhost，用 IP 打开时 /_next/* 资源会 403，页面没有交互。
 * 只匹配 Origin 的 hostname，不带协议和端口；仅开发环境生效。
 */
const allowedDevOrigins = [
  "192.168.1.129",
  "192.168.1.*",
  "10.*.*.*",
  "172.16.*.*",
  ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
];

/**
 * 管理后台（默认端口 3001）。
 * 与 C端完全独立：只包含 /admin/* 页面，不加载商城前台的 Navbar / 客服组件。
 */
const nextConfig: NextConfig = {
  allowedDevOrigins,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: path.join(__dirname, "../.."),
    resolveAlias: {
      "@toy-store/shared": path.join(__dirname, "../../packages/shared/src/index.ts"),
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
