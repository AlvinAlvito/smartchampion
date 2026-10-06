-- AlterTable
ALTER TABLE `class_sessions` ADD COLUMN `recordingUrl` VARCHAR(500) NULL,
    ADD COLUMN `worksheetDueAt` DATETIME(3) NULL,
    ADD COLUMN `worksheetPublished` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `worksheet_questions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `imageUrl` VARCHAR(255) NULL,
    `options` JSON NOT NULL,
    `answerIndex` INTEGER NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 10,
    `explanation` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `worksheet_questions_sessionId_order_idx`(`sessionId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `worksheet_attempts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `answers` JSON NOT NULL,
    `correctCount` INTEGER NOT NULL,
    `totalQuestions` INTEGER NOT NULL,
    `earnedPoints` INTEGER NOT NULL,
    `maxPoints` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `grade` VARCHAR(2) NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `worksheet_attempts_sessionId_userId_key`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `note` VARCHAR(255) NULL,
    `markedById` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attendances_sessionId_userId_key`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `worksheet_questions` ADD CONSTRAINT `worksheet_questions_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `class_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worksheet_attempts` ADD CONSTRAINT `worksheet_attempts_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `class_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `worksheet_attempts` ADD CONSTRAINT `worksheet_attempts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `class_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_markedById_fkey` FOREIGN KEY (`markedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

