-- CreateTable
CREATE TABLE `activity_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `entity` VARCHAR(20) NOT NULL,
    `action` VARCHAR(12) NOT NULL,
    `entityId` INTEGER NULL,
    `label` VARCHAR(200) NULL,
    `productId` INTEGER NULL,
    `gameId` INTEGER NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `detail` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_logs_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `activity_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
