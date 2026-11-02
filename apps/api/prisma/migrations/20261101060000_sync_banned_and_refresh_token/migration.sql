-- 基线迁移（baseline）：补齐历史上用 `prisma db push` 直接推库、但没有生成迁移文件的改动。
--
-- 背景：封禁功能（bannedAt / bannedReason）和双 Token（RefreshToken 表）当时是 db push 上去的，
-- 导致迁移历史与实际库结构漂移，`migrate dev` 会报 "Drift detected" 并要求 reset。
-- 这里用 `prisma migrate diff` 从迁移历史推到实际库，把这段差异固化成一条迁移，
-- 再用 `prisma migrate resolve --applied` 标记为已应用（不重复执行）。
--
-- 该文件内容由 Prisma 生成，请勿手改（改动会导致 checksum 不匹配）。

-- AlterTable
ALTER TABLE "User" ADD COLUMN "bannedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "bannedReason" TEXT;

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId" ASC);

