-- AlterTable
ALTER TABLE `wa_chats` ADD COLUMN `isGroup` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `wa_messages` ADD COLUMN `senderName` VARCHAR(120) NULL,
    ADD COLUMN `senderPhone` VARCHAR(30) NULL;
