-- Pendaftaran tetap disimpan saat peserta dilepas dari kelas.
ALTER TABLE `registrations`
  DROP FOREIGN KEY `registrations_productId_fkey`,
  MODIFY `productId` INTEGER NULL;

ALTER TABLE `registrations`
  ADD CONSTRAINT `registrations_productId_fkey`
  FOREIGN KEY (`productId`) REFERENCES `products`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
