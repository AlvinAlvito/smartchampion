-- AlterTable
ALTER TABLE `wa_chats` ADD COLUMN `aiAnalyzedMsgId` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `wa_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `shortcut` VARCHAR(40) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `isShared` BOOLEAN NOT NULL DEFAULT false,
    `useCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wa_templates_ownerId_shortcut_key`(`ownerId`, `shortcut`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_bots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `persona` JSON NULL,
    `styleNotes` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `lastAnalyzedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `admin_bots_accountId_key`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_bot_memories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `botId` INTEGER NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `question` TEXT NULL,
    `answer` TEXT NOT NULL,
    `answerCategory` VARCHAR(80) NULL,
    `hits` INTEGER NOT NULL DEFAULT 1,
    `sourceChatId` INTEGER NULL,
    `learnedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_bot_memories_botId_kind_category_idx`(`botId`, `kind`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wa_templates` ADD CONSTRAINT `wa_templates_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_bots` ADD CONSTRAINT `admin_bots_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `wa_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_bot_memories` ADD CONSTRAINT `admin_bot_memories_botId_fkey` FOREIGN KEY (`botId`) REFERENCES `admin_bots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
