import path from "node:path";
import type { NextConfig } from "next";

/**
 * C端前台（默认端口 3000）。
 * 只负责页面渲染与交互，所有数据都来自 apps/api。
 */
const nextConfig: NextConfig = {
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
