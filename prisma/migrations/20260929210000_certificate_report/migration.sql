-- AlterTable
ALTER TABLE `products` ADD COLUMN `certificateBgUrl` VARCHAR(255) NULL,
    ADD COLUMN `certificateConfig` JSON NULL,
    ADD COLUMN `reportPublished` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `class_results` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `note` TEXT NULL,
    `certificateNo` VARCHAR(80) NULL,
    `certificateName` VARCHAR(120) NULL,
    `certificateIssuedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `class_results_certificateNo_key`(`certificateNo`),
    UNIQUE INDEX `class_results_productId_userId_key`(`productId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `class_results` ADD CONSTRAINT `class_results_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_results` ADD CONSTRAINT `class_results_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

