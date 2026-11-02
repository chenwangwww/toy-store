import bcrypt from 'bcryptjs';

/**
 * bcrypt 成本因子。10 轮在「安全」和「登录响应速度」之间比较平衡：
 * 单次哈希约 50~100ms，暴力破解的成本则随轮数指数上升。
 */
const SALT_ROUNDS = 10;

/** bcrypt 哈希固定以 $2a$ / $2b$ / $2y$ + 两位成本因子开头 */
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

/** 判断一个字符串是不是已经哈希过了（用来识别历史遗留的明文密码） */
export function isHashed(value: string): boolean {
  return BCRYPT_PATTERN.test(value);
}

/** 把明文密码哈希后入库 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * 校验密码。
 *
 * 正常路径走 bcrypt.compare（内部是恒定时间比较，不会被计时攻击）。
 * 但库里可能还有早期版本写入的明文密码，这时退化成直接比对，
 * 保证老账号不会因为这次改造被锁在门外。
 * 升级动作由 login 分支里的 ensureHashed 完成，跑过一次就不会再走这个分支。
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (isHashed(stored)) return bcrypt.compare(plain, stored);
  return plain === stored;
}
