/**
 * 一次性脚本：把数据库里遗留的明文密码批量换成 bcrypt 哈希。
 *
 * 用法（在 apps/api 目录下）：
 *   pnpm hash-passwords
 *
 * 幂等：已经是 bcrypt 哈希的账号会被跳过，重复跑没有副作用。
 * 用户的原始密码不会变，只是存储形式从明文变成哈希，登录体验完全一样。
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, password: true },
  });

  const legacy = users.filter((u) => !BCRYPT_PATTERN.test(u.password));

  if (legacy.length === 0) {
    console.log(`共 ${users.length} 个账号，密码已全部是 bcrypt 哈希，无需处理。`);
    return;
  }

  console.log(`共 ${users.length} 个账号，其中 ${legacy.length} 个还是明文，开始哈希...\n`);

  for (const u of legacy) {
    await prisma.user.update({
      where: { id: u.id },
      data: { password: await bcrypt.hash(u.password, SALT_ROUNDS) },
    });
    console.log(`  ✓ ${u.email}`);
  }

  console.log(`\n完成，${legacy.length} 个账号已升级为 bcrypt 哈希。用户照常用原密码登录。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
