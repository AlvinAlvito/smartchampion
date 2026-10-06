
-- CreateTable
CREATE TABLE `chat_knowledge` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `judul` VARCHAR(160) NOT NULL,
    `kategori` VARCHAR(60) NOT NULL DEFAULT 'Umum',
    `isi` TEXT NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `urutan` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chat_knowledge_isActive_urutan_idx`(`isActive`, `urutan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_conversations` (
    `id` VARCHAR(40) NOT NULL,
    `userId` INTEGER NULL,
    `userName` VARCHAR(120) NULL,
    `page` VARCHAR(160) NULL,
    `unanswered` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chat_conversations_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` VARCHAR(40) NOT NULL,
    `role` VARCHAR(12) NOT NULL,
    `content` TEXT NOT NULL,
    `answered` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_messages_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `chat_messages_answered_idx`(`answered`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Pengetahuan awal chatbot (diambil dari isi situs; bisa diubah di menu Chatbot AI)
INSERT INTO `chat_knowledge` (`judul`,`kategori`,`isi`,`isActive`,`urutan`,`createdAt`,`updatedAt`) VALUES
('Tentang Pelatihan POSI','Umum','Pelatihan POSI adalah ekosistem pelatihan dari Yayasan Pendidikan POSI (program POSI × SmartChampion, Kelas Premium 2026). Ada dua produk:
- Champion Online Class (COC): kelas pendampingan online bersama tutor untuk persiapan olimpiade (OSN, KSM) dan TKA.
- Mimpi.mu: platform belajar mandiri untuk berlatih, memantau progres, dan memahami bagian yang perlu ditingkatkan.
Selain itu tersedia games edukasi dengan leaderboard.',true,1,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
('Keunggulan Champion Online Class (COC)','Produk','COC adalah kelas bimbingan online bersama tutor berpengalaman, untuk siswa yang ingin latihan lebih terarah.
- Tutor expert dan medalis olimpiade.
- Metode realistis-eksploratif: konsep, latihan terarah, lalu pembahasan (paham, bukan sekadar hafal).
- Jadwal dan materi (PDF, video, artikel) tersedia di dashboard peserta.
- Tersedia untuk jenjang SD, SMP, SMA, dan umum.
Daftar kelas lengkap beserta harga, jadwal, dan kuota ada di halaman /kelas.',true,2,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
('Kapan kelas COC dimulai?','Kelas','Setiap bidang/kelas COC dimulai setelah minimal 15 peserta terdaftar dan lunas. Progres kuota bisa dilihat langsung di halaman setiap kelas (/kelas).',true,3,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
('Selama menunggu kelas dimulai','Kelas','Selama menunggu kuota kelas terpenuhi, peserta yang sudah lunas sudah bisa mengakses materi awal dan bermain games edukasi. Skor games masuk leaderboard.',true,4,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
('Cara mendaftar kelas COC','Pendaftaran','Langkah mendaftar:
1. Buat akun peserta gratis di /register (isi data diri dan asal sekolah).
2. Pilih kelas sesuai bidang dan jenjang di /kelas.
3. Bayar online (virtual account bank, e-wallet, QRIS, atau kartu) melalui Midtrans.
4. Mulai belajar: jadwal, materi, dan games bisa diakses di dashboard (/dashboard).',true,5,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
('Pembayaran','Pembayaran','Pembayaran diproses dengan aman oleh Midtrans. Metode yang tersedia: virtual account bank, e-wallet, QRIS, atau kartu. Status pendaftaran otomatis berubah menjadi lunas setelah pembayaran berhasil. Riwayat transaksi bisa dilihat di dashboard peserta.',true,6,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
('Beda COC dan Mimpi.mu','Produk','COC adalah kelas dengan tutor (pendampingan). Mimpi.mu adalah platform belajar mandiri dengan latihan soal dan analisis performa berbasis AI.',true,7,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
('Mimpi.mu','Produk','Mimpi.mu adalah platform belajar mandiri untuk berlatih, memantau progres, dan memahami bagian yang perlu ditingkatkan.
- Persiapan TKA dan UTBK.
- Latihan OSN dan KSM.
- Analisis performa berbasis AI.
- Bisa coba gratis dulu.
Paket: 1 bulan Rp 49.000, 3 bulan Rp 99.000 (terlaris), 6 bulan Rp 179.000.
Situs: https://mimpi.mu',true,8,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)),
('Jam layanan admin','Kontak','Admin Pelatihan POSI melayani chat WhatsApp setiap Senin sampai Sabtu, pukul 08.00 sampai 20.00 WIB.',true,9,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3));
