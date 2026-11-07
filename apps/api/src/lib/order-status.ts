/**
 * 订单状态白名单。
 *
 * 为什么不从 @toy-store/shared 引：shared 包约定"只放类型，不放运行时代码"，
 * 而 api 侧又没装这个 workspace 依赖，所以这里单独维护一份常量。
 * 改状态枚举时，这个数组和 shared 里的 OrderStatus 要一起改。
 */

export const ORDER_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number]

/**
 * 校验请求体里的状态值。
 * Order.status 在 Prisma 里是 String 不是 enum，数据库不会帮我们拦非法值，
 * 所以必须在应用层做白名单校验，不能直接把 body.status 写进库。
 */
export function isOrderStatus(value: unknown): value is OrderStatusValue {
    return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value)
}