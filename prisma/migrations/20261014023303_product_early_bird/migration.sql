-- AlterTable
ALTER TABLE `products` ADD COLUMN `earlyEnd` DATETIME(3) NULL,
    ADD COLUMN `earlyPrice` INTEGER NULL,
    ADD COLUMN `earlyStart` DATETIME(3) NULL;
