-- CreateTable
CREATE TABLE `guides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(160) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `summary` VARCHAR(255) NULL,
    `category` VARCHAR(60) NOT NULL DEFAULT 'Umum',
    `coverUrl` VARCHAR(255) NULL,
    `videoUrl` VARCHAR(500) NULL,
    `content` TEXT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT true,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `guides_slug_key`(`slug`),
    INDEX `guides_isPublished_sortOrder_idx`(`isPublished`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guide_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guideId` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(160) NOT NULL,
    `body` TEXT NOT NULL,
    `imageUrl` VARCHAR(255) NULL,

    INDEX `guide_steps_guideId_sortOrder_idx`(`guideId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `guide_steps` ADD CONSTRAINT `guide_steps_guideId_fkey` FOREIGN KEY (`guideId`) REFERENCES `guides`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
