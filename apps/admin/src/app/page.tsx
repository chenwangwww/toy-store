import { redirect } from "next/navigation";

/** 后台站点根路径直接进入商品管理（未登录会被页面内的守卫拦到 /admin/login） */
export default function AdminIndexPage() {
  redirect("/admin/toys");
}
