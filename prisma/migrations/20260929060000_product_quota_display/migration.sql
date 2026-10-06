-- Opsi tampilan progres kuota di katalog (default AUTO: tampil bila >= 10 peserta lunas)
ALTER TABLE `products` ADD COLUMN `quotaDisplay` VARCHAR(10) NOT NULL DEFAULT 'AUTO';
