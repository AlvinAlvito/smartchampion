-- CreateTable
CREATE TABLE `blast_senders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED',
    `phone` VARCHAR(30) NULL,
    `waName` VARCHAR(120) NULL,
    `lastError` VARCHAR(255) NULL,
    `restricted` BOOLEAN NOT NULL DEFAULT false,
    `numberAge` VARCHAR(10) NOT NULL DEFAULT 'BARU',
    `connectedAt` DATETIME(3) NULL,
    `firstConnectedAt` DATETIME(3) NULL,
    `nextSendAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `blast_senders_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blast_contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `nama` VARCHAR(160) NOT NULL,
    `noHp` VARCHAR(30) NOT NULL,
    `email` VARCHAR(160) NULL,
    `jenjang` VARCHAR(30) NULL,
    `kelas` VARCHAR(30) NULL,
    `sekolah` VARCHAR(160) NULL,
    `kota` VARCHAR(100) NULL,
    `provinsi` VARCHAR(80) NULL,
    `labels` VARCHAR(255) NULL,
    `catatan` TEXT NULL,
    `source` VARCHAR(40) NULL,
    `optOut` BOOLEAN NOT NULL DEFAULT false,
    `optOutAt` DATETIME(3) NULL,
    `optOutReason` VARCHAR(160) NULL,
    `waStatus` VARCHAR(10) NOT NULL DEFAULT 'UNKNOWN',
    `blastCount` INTEGER NOT NULL DEFAULT 0,
    `lastBlastAt` DATETIME(3) NULL,
    `lastReplyAt` DATETIME(3) NULL,
    `blastId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `blast_contacts_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    INDEX `blast_contacts_noHp_idx`(`noHp`),
    UNIQUE INDEX `blast_contacts_ownerId_noHp_key`(`ownerId`, `noHp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blast_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `senderId` INTEGER NULL,
    `name` VARCHAR(160) NOT NULL,
    `message` TEXT NOT NULL,
    `imageFile` VARCHAR(80) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    `pauseReason` VARCHAR(255) NULL,
    `audienceNote` VARCHAR(255) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `delayMin` INTEGER NOT NULL DEFAULT 30,
    `delayMax` INTEGER NOT NULL DEFAULT 75,
    `batchSize` INTEGER NOT NULL DEFAULT 20,
    `batchRestMin` INTEGER NOT NULL DEFAULT 10,
    `sentInBatch` INTEGER NOT NULL DEFAULT 0,
    `hourStart` INTEGER NOT NULL DEFAULT 8,
    `hourEnd` INTEGER NOT NULL DEFAULT 20,
    `dailyLimit` INTEGER NOT NULL DEFAULT 150,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `blast_campaigns_status_idx`(`status`),
    INDEX `blast_campaigns_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blast_recipients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaignId` INTEGER NOT NULL,
    `contactId` INTEGER NULL,
    `nama` VARCHAR(160) NOT NULL,
    `noHp` VARCHAR(30) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    `text` TEXT NULL,
    `waId` VARCHAR(100) NULL,
    `error` VARCHAR(255) NULL,
    `queuedAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `repliedAt` DATETIME(3) NULL,
    `replyText` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `blast_recipients_campaignId_status_id_idx`(`campaignId`, `status`, `id`),
    INDEX `blast_recipients_noHp_sentAt_idx`(`noHp`, `sentAt`),
    INDEX `blast_recipients_waId_idx`(`waId`),
    INDEX `blast_recipients_queuedAt_idx`(`queuedAt`),
    UNIQUE INDEX `blast_recipients_campaignId_noHp_key`(`campaignId`, `noHp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `blast_senders` ADD CONSTRAINT `blast_senders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_contacts` ADD CONSTRAINT `blast_contacts_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_campaigns` ADD CONSTRAINT `blast_campaigns_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_campaigns` ADD CONSTRAINT `blast_campaigns_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `blast_senders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_recipients` ADD CONSTRAINT `blast_recipients_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `blast_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blast_recipients` ADD CONSTRAINT `blast_recipients_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `blast_contacts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
