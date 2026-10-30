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