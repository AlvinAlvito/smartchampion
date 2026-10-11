-- AlterTable
ALTER TABLE `class_sessions` ADD COLUMN `restricted` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `session_viewers` (
    `sessionId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `session_viewers_userId_idx`(`userId`),
    PRIMARY KEY (`sessionId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session_viewers` ADD CONSTRAINT `session_viewers_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `class_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_viewers` ADD CONSTRAINT `session_viewers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
