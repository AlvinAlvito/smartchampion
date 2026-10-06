-- Chat WA: auto-balas AI + gambar masuk
ALTER TABLE `wa_accounts` ADD COLUMN `autoReply` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `wa_chats` ADD COLUMN `aiPaused` BOOLEAN NOT NULL DEFAULT false, ADD COLUMN `aiNote` VARCHAR(160) NULL;
ALTER TABLE `wa_messages` ADD COLUMN `byAi` BOOLEAN NOT NULL DEFAULT false, ADD COLUMN `hasMedia` BOOLEAN NOT NULL DEFAULT false;
