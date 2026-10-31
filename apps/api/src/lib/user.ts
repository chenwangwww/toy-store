import type { User } from '@prisma/client'

/** 对外返回用户信息时一定要去掉密码等敏感字段 */
export function toPublicUser(user: User) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
    };
}

/** 后台用的用户信息：比 C 端多封禁状态 */
export function toAdminUser(user: {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  isAdmin: boolean;
  bannedAt: Date | null;
  bannedReason: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    isAdmin: user.isAdmin,
    bannedAt: user.bannedAt,
    bannedReason: user.bannedReason,
    createdAt: user.createdAt,
  };
}