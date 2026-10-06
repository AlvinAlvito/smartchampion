-- Pendaftaran yang diaktifkan dari Master Lead (tautan ke lead asal)
ALTER TABLE `registrations` ADD COLUMN `sourceLeadId` INTEGER NULL;
CREATE INDEX `registrations_sourceLeadId_idx` ON `registrations`(`sourceLeadId`);
