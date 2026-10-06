-- CreateTable
CREATE TABLE `wa_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED',
    `phone` VARCHAR(30) NULL,
    `waName` VARCHAR(120) NULL,
    `lastError` VARCHAR(255) NULL,
    `restricted` BOOLEAN NOT NULL DEFAULT false,
    `connectedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wa_accounts_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_chats` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `jid` VARCHAR(80) NOT NULL,
    `lid` VARCHAR(80) NULL,
    `phone` VARCHAR(30) NULL,
    `name` VARCHAR(120) NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `lastMessageText` VARCHAR(255) NULL,
    `lastFromMe` BOOLEAN NOT NULL DEFAULT false,
    `unread` INTEGER NOT NULL DEFAULT 0,
    `hasIncoming` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wa_chats_accountId_lastMessageAt_idx`(`accountId`, `lastMessageAt`),
    INDEX `wa_chats_accountId_phone_idx`(`accountId`, `phone`),
    INDEX `wa_chats_accountId_lid_idx`(`accountId`, `lid`),
    UNIQUE INDEX `wa_chats_accountId_jid_key`(`accountId`, `jid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wa_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `chatId` INTEGER NOT NULL,
    `waId` VARCHAR(100) NULL,
    `fromMe` BOOLEAN NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'text',
    `body` TEXT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'RECEIVED',
    `error` VARCHAR(255) NULL,
    `sentById` INTEGER NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wa_messages_chatId_id_idx`(`chatId`, `id`),
    UNIQUE INDEX `wa_messages_chatId_waId_key`(`chatId`, `waId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wa_accounts` ADD CONSTRAINT `wa_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wa_chats` ADD CONSTRAINT `wa_chats_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `wa_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wa_messages` ADD CONSTRAINT `wa_messages_chatId_fkey` FOREIGN KEY (`chatId`) REFERENCES `wa_chats`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wa_messages` ADD CONSTRAINT `wa_messages_sentById_fkey` FOREIGN KEY (`sentById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

