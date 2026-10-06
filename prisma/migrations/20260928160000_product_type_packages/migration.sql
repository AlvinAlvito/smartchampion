-- AlterTable

-- AlterTable
ALTER TABLE `products` ADD COLUMN `type` ENUM('COC', 'PRIVATE') NOT NULL DEFAULT 'COC';

-- AlterTable
ALTER TABLE `registrations` ADD COLUMN `packageId` INTEGER NULL,
    ADD COLUMN `sessionsBought` INTEGER NULL,
    ADD COLUMN `sessionsDone` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `product_packages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `sessions` INTEGER NOT NULL,
    `price` INTEGER NOT NULL,
    `label` VARCHAR(40) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `product_packages_productId_isActive_idx`(`productId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `product_packages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_packages` ADD CONSTRAINT `product_packages_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

