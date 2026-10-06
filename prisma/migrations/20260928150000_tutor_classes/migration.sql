-- AlterTable

-- CreateTable
CREATE TABLE `_TutorClasses` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_TutorClasses_AB_unique`(`A`, `B`),
    INDEX `_TutorClasses_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_TutorClasses` ADD CONSTRAINT `_TutorClasses_A_fkey` FOREIGN KEY (`A`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_TutorClasses` ADD CONSTRAINT `_TutorClasses_B_fkey` FOREIGN KEY (`B`) REFERENCES `tutors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

