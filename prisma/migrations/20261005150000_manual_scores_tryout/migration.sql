-- Nilai manual per pertemuan + nilai Try Out Mimpi.mu
CREATE TABLE `meeting_scores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `score` DOUBLE NOT NULL,
    `note` VARCHAR(255) NULL,
    `updatedBy` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `meeting_scores_sessionId_userId_key`(`sessionId`, `userId`),
    INDEX `meeting_scores_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `meeting_scores` ADD CONSTRAINT `meeting_scores_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `class_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `meeting_scores` ADD CONSTRAINT `meeting_scores_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `class_results` ADD COLUMN `tryoutScore` DOUBLE NULL, ADD COLUMN `tryoutNote` VARCHAR(255) NULL;
