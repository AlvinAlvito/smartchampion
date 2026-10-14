-- AlterTable
ALTER TABLE `registrations` ADD COLUMN `discount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `voucherCode` VARCHAR(40) NULL,
    ADD COLUMN `voucherId` INTEGER NULL;

-- CreateTable
CREATE TABLE `vouchers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `description` VARCHAR(255) NULL,
    `type` ENUM('PERCENT', 'AMOUNT') NOT NULL,
    `value` INTEGER NOT NULL,
    `maxDiscount` INTEGER NULL,
    `minAmount` INTEGER NULL,
    `quota` INTEGER NULL,
    `validFrom` DATETIME(3) NULL,
    `validUntil` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allProducts` BOOLEAN NOT NULL DEFAULT true,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vouchers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_VoucherProducts` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_VoucherProducts_AB_unique`(`A`, `B`),
    INDEX `_VoucherProducts_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `registrations_voucherId_idx` ON `registrations`(`voucherId`);

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `vouchers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vouchers` ADD CONSTRAINT `vouchers_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_VoucherProducts` ADD CONSTRAINT `_VoucherProducts_A_fkey` FOREIGN KEY (`A`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_VoucherProducts` ADD CONSTRAINT `_VoucherProducts_B_fkey` FOREIGN KEY (`B`) REFERENCES `vouchers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
