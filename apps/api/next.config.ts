import type { NextConfig } from "next";

/**
 * 纯后端服务：
 * - 只暴露 src/app/api 下的 Route Handlers，没有任何页面/样式
 * - 默认端口 4000（见 package.json 的 dev/start 脚本）
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Prisma Client 是原生依赖，交给 Node 直接 require，不参与打包
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
