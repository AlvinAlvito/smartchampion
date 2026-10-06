-- AlterTable
ALTER TABLE `users` ADD COLUMN `lastLoginAt` DATETIME(3) NULL,
    ADD COLUMN `lastSeenAt` DATETIME(3) NULL;
