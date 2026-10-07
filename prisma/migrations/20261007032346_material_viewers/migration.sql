-- AlterTable
ALTER TABLE `materials` ADD COLUMN `restricted` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `material_viewers` (
    `materialId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `material_viewers_userId_idx`(`userId`),
    PRIMARY KEY (`materialId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `material_viewers` ADD CONSTRAINT `material_viewers_materialId_fkey` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_viewers` ADD CONSTRAINT `material_viewers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
