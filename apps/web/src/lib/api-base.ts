/**
 * 后端服务地址。
 * C端是独立站点，所有接口都要走绝对地址打到纯后端服务（默认 http://localhost:4000）。
 * 部署时通过 NEXT_PUBLIC_API_BASE_URL 指向真实后端域名。
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");
