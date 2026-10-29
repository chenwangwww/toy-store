import path from "node:path";
import type { NextConfig } from "next";

/**
 * 管理后台（默认端口 3001）。
 * 与 C端完全独立：只包含 /admin/* 页面，不加载商城前台的 Navbar / 客服组件。
 */
const nextConfig: NextConfig = {
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
