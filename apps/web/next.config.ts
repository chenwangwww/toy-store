import path from "node:path";
import type { NextConfig } from "next";

/**
 * 允许通过局域网 IP / 自定义域名访问 dev server。
 *
 * Next 默认只放行 localhost 和启动时的 hostname，用 IP（如 192.168.1.129:3000）
 * 打开页面时，带 Origin 的 /_next/* 资源请求会被 403，HMR websocket 也连不上。
 * 结果就是页面能渲染、但 JS 不执行——商品列表空、按钮点不动。
 *
 * 这里只匹配 Origin 的 hostname，不写协议和端口；* 代表一个 hostname 段。
 * 仅开发环境生效，不影响生产。
 */
const allowedDevOrigins = [
  "192.168.1.129", // 本机当前局域网 IP（手机调试用）
  "192.168.1.*", // 同网段其他地址
  "10.*.*.*",
  "172.16.*.*",
  ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
];

/**
 * C端前台（默认端口 3000）。
 * 只负责页面渲染与交互，所有数据都来自 apps/api。
 */
const nextConfig: NextConfig = {
  allowedDevOrigins,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // 让 Turbopack 以仓库根目录为解析范围，才能读到 packages/shared
    root: path.join(__dirname, "../.."),
    // 共享类型直接指向源码，不依赖 workspace 软链
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
