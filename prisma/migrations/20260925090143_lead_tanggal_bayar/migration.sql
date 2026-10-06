-- AlterTable
ALTER TABLE `games` MODIFY `emoji` VARCHAR(16) NOT NULL DEFAULT '🎯';

-- AlterTable
ALTER TABLE `leads` ADD COLUMN `tanggalBayar` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `leads_tanggalBayar_idx` ON `leads`(`tanggalBayar`);

-- Backfill: lead yang sudah Paid
-- 1) dari pendaftaran web → tanggal lunas Midtrans
UPDATE `leads` l JOIN `registrations` r ON r.`code` = l.`invoiceId`
SET l.`tanggalBayar` = r.`paidAt`
WHERE l.`statusFunnel` = 'Paid' AND r.`paidAt` IS NOT NULL;

-- 2) sisanya (impor Excel / input manual) → perkiraan: last contact, atau tanggal masuk bila lebih akhir
UPDATE `leads`
SET `tanggalBayar` = GREATEST(`tanggalMasuk`, COALESCE(`lastContact`, `tanggalMasuk`))
WHERE `statusFunnel` = 'Paid' AND `tanggalBayar` IS NULL;
