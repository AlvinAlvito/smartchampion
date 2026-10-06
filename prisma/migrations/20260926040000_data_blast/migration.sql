-- AlterTable
ALTER TABLE `games` MODIFY `emoji` VARCHAR(16) NOT NULL DEFAULT '🎯';

-- CreateTable
CREATE TABLE `blasts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tanggal` DATETIME(3) NOT NULL,
    `nama` VARCHAR(160) NOT NULL,
    `email` VARCHAR(160) NULL,
    `noHp` VARCHAR(30) NULL,
    `provinsi` VARCHAR(80) NULL,
    `kota` VARCHAR(100) NULL,
    `jenjang` VARCHAR(30) NULL,
    `sekolah` VARCHAR(160) NULL,
    `ownerId` INTEGER NULL,
    `asalBlast` VARCHAR(20) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `blasts_tanggal_idx`(`tanggal`),
    INDEX `blasts_asalBlast_idx`(`asalBlast`),
    INDEX `blasts_noHp_idx`(`noHp`),
    INDEX `blasts_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `blasts` ADD CONSTRAINT `blasts_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

