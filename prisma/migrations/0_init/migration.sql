-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('SUPERADMIN', 'ADMIN', 'PESERTA') NOT NULL DEFAULT 'PESERTA',
    `phone` VARCHAR(30) NULL,
    `school` VARCHAR(160) NULL,
    `jenjang` ENUM('SD', 'SMP', 'SMA', 'UMUM') NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(160) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `bidang` VARCHAR(80) NOT NULL,
    `jenjang` ENUM('SD', 'SMP', 'SMA', 'UMUM') NOT NULL,
    `level` VARCHAR(40) NOT NULL DEFAULT 'Advance',
    `gradeLabel` VARCHAR(80) NULL,
    `shortDesc` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `price` INTEGER NOT NULL,
    `priceUnit` VARCHAR(30) NOT NULL DEFAULT 'bulan',
    `minQuota` INTEGER NOT NULL DEFAULT 15,
    `maxQuota` INTEGER NULL,
    `scheduleInfo` VARCHAR(255) NULL,
    `startDate` DATETIME(3) NULL,
    `status` ENUM('DRAFT', 'OPEN', 'RUNNING', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `imageUrl` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registrations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `userId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `fullName` VARCHAR(120) NOT NULL,
    `school` VARCHAR(160) NOT NULL,
    `phone` VARCHAR(30) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `parentPhone` VARCHAR(30) NULL,
    `source` VARCHAR(60) NOT NULL,
    `adminId` INTEGER NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `midtransOrderId` VARCHAR(64) NULL,
    `snapToken` VARCHAR(128) NULL,
    `paymentType` VARCHAR(40) NULL,
    `paidAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `registrations_code_key`(`code`),
    UNIQUE INDEX `registrations_midtransOrderId_key`(`midtransOrderId`),
    INDEX `registrations_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `meetingUrl` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `materials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `type` ENUM('PDF', 'VIDEO', 'ARTICLE') NOT NULL,
    `url` VARCHAR(500) NULL,
    `content` LONGTEXT NULL,
    `summary` VARCHAR(255) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT true,
    `authorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tanggalMasuk` DATETIME(3) NOT NULL,
    `nama` VARCHAR(160) NOT NULL,
    `noWa` VARCHAR(30) NULL,
    `email` VARCHAR(160) NULL,
    `sumberLead` VARCHAR(60) NOT NULL,
    `campaign` VARCHAR(160) NULL,
    `kategori` VARCHAR(40) NOT NULL DEFAULT 'Calon Customer',
    `produk` VARCHAR(60) NULL,
    `paket` VARCHAR(120) NULL,
    `ownerId` INTEGER NULL,
    `statusFunnel` VARCHAR(30) NOT NULL DEFAULT 'Baru',
    `trialMimpimu` VARCHAR(30) NULL,
    `invoiceId` VARCHAR(80) NULL,
    `statusBayar` VARCHAR(30) NULL,
    `nominal` INTEGER NULL,
    `lastContact` DATETIME(3) NULL,
    `nextFollowUp` DATETIME(3) NULL,
    `objection` TEXT NULL,
    `nextAction` TEXT NULL,
    `catatan` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leads_statusFunnel_idx`(`statusFunnel`),
    INDEX `leads_sumberLead_idx`(`sumberLead`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `games` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(120) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `subject` VARCHAR(60) NOT NULL,
    `jenjang` ENUM('SD', 'SMP', 'SMA', 'UMUM') NOT NULL DEFAULT 'UMUM',
    `type` VARCHAR(30) NOT NULL DEFAULT 'QUIZ',
    `secondsPerQuestion` INTEGER NOT NULL DEFAULT 20,
    `emoji` VARCHAR(16) NOT NULL DEFAULT '🎯',
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `launchedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `games_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_questions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gameId` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `options` JSON NOT NULL,
    `answerIndex` INTEGER NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 100,
    `order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_scores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `gameId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `score` INTEGER NOT NULL,
    `correctCount` INTEGER NOT NULL,
    `totalQuestions` INTEGER NOT NULL,
    `durationMs` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `game_scores_gameId_score_idx`(`gameId`, `score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class_sessions` ADD CONSTRAINT `class_sessions_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `materials` ADD CONSTRAINT `materials_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `materials` ADD CONSTRAINT `materials_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_questions` ADD CONSTRAINT `game_questions_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_scores` ADD CONSTRAINT `game_scores_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_scores` ADD CONSTRAINT `game_scores_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

