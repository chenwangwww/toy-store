/**
 * 后端服务地址。
 *
 * 优先级：
 * 1. NEXT_PUBLIC_API_BASE_URL —— 部署时显式指定后端域名（推荐生产环境用这个）
 * 2. 浏览器里自动用「当前访问的主机名 + 4000 端口」——
 *    这样手机或同事电脑通过局域网 IP 打开后台时，接口会打到同一台机器的 4000 端口，
 *    而不是打到各自设备上的 localhost（那上面根本没有后端）
 * 3. 兜底 http://localhost:4000
 */
const API_PORT = 4000;

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    // 保留当前页面的协议和主机名，只把端口换成后端端口。
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();
