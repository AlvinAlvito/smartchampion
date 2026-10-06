-- AlterTable
ALTER TABLE `feedbacks` MODIFY `tutorRating` DOUBLE NULL,
    MODIFY `adminRating` DOUBLE NULL,
    MODIFY `materialRating` DOUBLE NULL,
    MODIFY `overallRating` DOUBLE NULL;

-- CreateTable
CREATE TABLE `feedback_questions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `text` VARCHAR(300) NOT NULL,
    `description` VARCHAR(300) NULL,
    `category` ENUM('TUTOR', 'ADMIN', 'MATERI', 'KESELURUHAN', 'UMUM') NOT NULL DEFAULT 'UMUM',
    `type` ENUM('RATING', 'CHOICE', 'TEXT') NOT NULL DEFAULT 'RATING',
    `options` JSON NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `feedback_questions_isActive_order_idx`(`isActive`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedback_answers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `feedbackId` INTEGER NOT NULL,
    `questionId` INTEGER NULL,
    `questionText` VARCHAR(300) NOT NULL,
    `category` ENUM('TUTOR', 'ADMIN', 'MATERI', 'KESELURUHAN', 'UMUM') NOT NULL,
    `type` ENUM('RATING', 'CHOICE', 'TEXT') NOT NULL,
    `rating` INTEGER NULL,
    `text` TEXT NULL,

    INDEX `feedback_answers_feedbackId_idx`(`feedbackId`),
    INDEX `feedback_answers_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `feedback_answers` ADD CONSTRAINT `feedback_answers_feedbackId_fkey` FOREIGN KEY (`feedbackId`) REFERENCES `feedbacks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback_answers` ADD CONSTRAINT `feedback_answers_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `feedback_questions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Pertanyaan bawaan (bisa diubah/dihapus admin)
INSERT INTO `feedback_questions` (`text`, `description`, `category`, `type`, `options`, `required`, `isActive`, `order`, `updatedAt`) VALUES
    ('Seberapa puas kamu dengan cara tutor mengajar?', 'Penjelasan, penguasaan materi, dan kesabaran tutor', 'TUTOR', 'RATING', NULL, true, true, 1, CURRENT_TIMESTAMP(3)),
    ('Seberapa puas kamu dengan pelayanan admin?', 'Informasi jadwal, respons, dan bantuan admin', 'ADMIN', 'RATING', NULL, true, true, 2, CURRENT_TIMESTAMP(3)),
    ('Seberapa puas kamu dengan modul/materi dan worksheet?', 'Kelengkapan, kejelasan, dan manfaatnya', 'MATERI', 'RATING', NULL, true, true, 3, CURRENT_TIMESTAMP(3)),
    ('Secara keseluruhan, seberapa puas kamu dengan pelatihan ini?', NULL, 'KESELURUHAN', 'RATING', NULL, true, true, 4, CURRENT_TIMESTAMP(3)),
    ('Apakah kamu akan merekomendasikan kelas ini ke teman?', NULL, 'UMUM', 'CHOICE', '["Ya, pasti", "Mungkin", "Tidak"]', true, true, 5, CURRENT_TIMESTAMP(3)),
    ('Saran & kesan untuk kami', 'Apa yang paling kamu suka? Apa yang perlu kami tingkatkan?', 'UMUM', 'TEXT', NULL, false, true, 6, CURRENT_TIMESTAMP(3));
