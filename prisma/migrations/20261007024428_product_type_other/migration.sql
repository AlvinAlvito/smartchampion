-- AlterTable
ALTER TABLE `products` ADD COLUMN `sessionCount` INTEGER NULL,
    MODIFY `type` ENUM('COC', 'PRIVATE', 'OTHER') NOT NULL DEFAULT 'COC';
