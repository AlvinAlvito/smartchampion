
-- CreateTable
CREATE TABLE `tutors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(120) NOT NULL,
    `foto` VARCHAR(255) NULL,
    `bidang` VARCHAR(120) NULL,
    `pengalaman` TEXT NULL,
    `prestasi` TEXT NULL,
    `riwayatPendidikan` TEXT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT true,
    `urutan` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tutors_isPublished_urutan_idx`(`isPublished`, `urutan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

