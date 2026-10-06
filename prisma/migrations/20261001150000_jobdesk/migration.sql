-- CreateTable
CREATE TABLE `job_weeks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `week` INTEGER NOT NULL,
    `roleTitle` VARCHAR(200) NULL,
    `focus` TEXT NULL,
    `context` TEXT NULL,
    `conclusion` TEXT NULL,
    `reviewNote` TEXT NULL,
    `reviewNoteBy` VARCHAR(120) NULL,
    `reviewNoteAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_weeks_userId_year_week_key`(`userId`, `year`, `week`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_weeklies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `weekId` INTEGER NOT NULL,
    `category` ENUM('PRIORITAS', 'SISTEM', 'PEOPLE', 'OPERASIONAL') NOT NULL DEFAULT 'PRIORITAS',
    `title` VARCHAR(200) NOT NULL,
    `objective` VARCHAR(300) NULL,
    `doneMeasure` TEXT NULL,
    `leadMeasure` TEXT NULL,
    `pic` VARCHAR(120) NULL,
    `startDate` DATE NULL,
    `dueDate` DATE NULL,
    `ld1` TEXT NULL,
    `ld2` TEXT NULL,
    `ld3` TEXT NULL,
    `ld1Ok` BOOLEAN NOT NULL DEFAULT false,
    `ld2Ok` BOOLEAN NOT NULL DEFAULT false,
    `ld3Ok` BOOLEAN NOT NULL DEFAULT false,
    `steps` TEXT NULL,
    `beneficiaries` VARCHAR(300) NULL,
    `opsStatus` VARCHAR(120) NULL,
    `opsReason` TEXT NULL,
    `opsHandling` TEXT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `rootNote` TEXT NULL,
    `rootNoteBy` VARCHAR(120) NULL,
    `rootNoteAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_weeklies_weekId_category_order_idx`(`weekId`, `category`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_dailies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `notes` TEXT NULL,
    `priority` ENUM('RENDAH', 'SEDANG', 'TINGGI') NOT NULL DEFAULT 'SEDANG',
    `dueTime` VARCHAR(5) NULL,
    `weeklyId` INTEGER NULL,
    `routineId` INTEGER NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `rootNote` TEXT NULL,
    `rootNoteBy` VARCHAR(120) NULL,
    `rootNoteAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_dailies_userId_date_idx`(`userId`, `date`),
    UNIQUE INDEX `job_dailies_routineId_date_key`(`routineId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_routines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `notes` TEXT NULL,
    `priority` ENUM('RENDAH', 'SEDANG', 'TINGGI') NOT NULL DEFAULT 'SEDANG',
    `dueTime` VARCHAR(5) NULL,
    `weekdays` VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_routines_userId_isActive_idx`(`userId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `authorId` INTEGER NULL,
    `date` DATE NULL,
    `content` TEXT NOT NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `job_notes_userId_pinned_createdAt_idx`(`userId`, `pinned`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_weeks` ADD CONSTRAINT `job_weeks_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_weeklies` ADD CONSTRAINT `job_weeklies_weekId_fkey` FOREIGN KEY (`weekId`) REFERENCES `job_weeks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_dailies` ADD CONSTRAINT `job_dailies_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_dailies` ADD CONSTRAINT `job_dailies_weeklyId_fkey` FOREIGN KEY (`weeklyId`) REFERENCES `job_weeklies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_dailies` ADD CONSTRAINT `job_dailies_routineId_fkey` FOREIGN KEY (`routineId`) REFERENCES `job_routines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_routines` ADD CONSTRAINT `job_routines_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_notes` ADD CONSTRAINT `job_notes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_notes` ADD CONSTRAINT `job_notes_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

