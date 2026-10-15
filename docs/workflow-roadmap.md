# Checklist pengembangan ServerUI

Checklist ini merangkum perubahan untuk mempermudah monitoring banyak server dan alur backup database. Tidak mencatat hostname, alamat IP, username, atau credential server.

## Sudah dikerjakan di source

- [x] Perlebar halaman daftar server dan tampilkan sampai empat kolom di layar lebar.
- [x] Jaga background tetap menutup layar saat daftar server discroll.
- [x] Tambahkan pencarian server berdasarkan nama, host, atau username serta filter status.
- [x] Tambahkan ringkasan jumlah server online dan yang perlu perhatian.
- [x] Tambahkan tombol **Check all** untuk mengetes koneksi dan mengambil uptime, CPU, RAM, serta disk. Maksimal tiga host diperiksa bersamaan.
- [x] Tampilkan snapshot resource terbaru di kartu server. Check berjalan manual; snapshot hanya disimpan di memori sesi aplikasi.
- [x] Tampilkan progres download dalam persen dan ukuran data yang sudah diterima.
- [x] Tambahkan pembatalan download aktif dan antrean download di dalam aplikasi.
- [x] Tambahkan group server yang bisa diedit (mis. VM Production / VM Sandbox), tampilkan kartu di section per group, dan sediakan filter group.
- [x] Tambahkan checkbox multi-select di listing, pilih semua server yang sedang terlihat, lalu buat group baru atau pindahkan pilihan ke group yang sudah ada dalam satu operasi atomik. Server bisa dikembalikan ke status tanpa group; aksi ini tidak menjalankan koneksi SSH.
- [x] Catat hasil security scan awal dan pemeriksaan inventaris server di percakapan kerja; jangan masukkan detail server atau credential ke dokumentasi repo.

## Sedang dikerjakan

- [x] Build web dan bundle unsigned macOS arm64; Go backend dicross-compile lewat Docker, lalu app dipasang dan dijalankan.
- [x] Tambahkan pemeriksaan host key SSH dengan fingerprint SHA-256 per server; koneksi tanpa pin atau dengan fingerprint berubah diblokir sebelum autentikasi.
- [x] Tambahkan alur tampilkan, bandingkan, dan setujui fingerprint dari formulir tambah/edit; tandai server lama yang belum dipin dan blokir tombol Connect sampai diverifikasi.
- [x] Compile backend melalui Docker tanpa memasang Go ke Mac.
- [x] Backup database lokal sebelum migrasi v2 dan v3; validasi startup setelah pemasangan: integrity check `ok`, schema v3 aktif, dan 13 server tetap tersimpan.
- [x] Tambahkan copy satu file lintas server dengan progres, cancel, dan temp file yang dibuang saat gagal.

## Berikutnya — keamanan SSH

- [ ] Verifikasi end-to-end first-connect dan perubahan host key setelah backend berhasil dikompilasi; pemulihan tetap memerlukan perbandingan fingerprint baru secara sengaja.
- [ ] Pastikan password/private key tetap di penyimpanan credential lokal terenkripsi dan tidak masuk ke log, export, diagnostics, atau support bundle.
- [ ] Tampilkan jenis autentikasi dan status host-key di detail koneksi.

## Berikutnya — transfer dan backup database

- [ ] Streaming download besar langsung ke disk agar file di atas batas 512 MiB juga punya progres dan tombol cancel tanpa menampung seluruh file di memori.
- [x] Copy satu file dari menu Files ke server backup lewat SFTP dengan progress dan cancel. Isi file tidak ditulis ke disk Mac; backend app merelay byte lewat memori, jadi transfer tetap bergantung pada koneksi Mac ke kedua server.
- [ ] Tambahkan transfer folder dan dukungan resume/checksum untuk file besar.
- [ ] Pertimbangkan transfer tanpa relay Mac hanya jika tersedia agen atau jalur SSH server-ke-server yang aman; jangan menanam credential server tujuan pada server sumber.
- [ ] Bedakan aksi copy dan move; tambahkan konfirmasi tujuan, penanganan overwrite, progres, cancel, dan retry.
- [ ] Buat alur backup database terpandu: dump, kompresi, opsi enkripsi, transfer, dan laporan hasil.
- [ ] Tambahkan kebijakan retensi backup dan pemeriksaan restore agar file yang berhasil ditransfer tidak otomatis dianggap backup terverifikasi.

## Berikutnya — inventaris dan monitoring

- [ ] Tambahkan favorit dan tag jamak untuk pengelompokan tambahan selain group utama.
- [ ] Tampilkan koneksi terakhir yang berhasil, latency, dan alasan koneksi gagal.
- [ ] Tambahkan pemeriksaan opsional untuk umur backup, ruang disk, dan status service.
- [ ] Kalau menambahkan check otomatis, sediakan interval yang jelas dan konservatif, kontrol on/off, serta batas koneksi bersamaan; jangan polling tanpa batas.
- [ ] Kenali alamat LAN dan Tailscale sebagai jalur alternatif ke host yang sama dan tunjukkan jalur yang dipakai.
- [ ] Tambahkan import/compare inventaris SSH dengan preview penambahan, perubahan, dan duplikat. Jangan import/export credential diam-diam.
- [ ] Simpan riwayat aktivitas koneksi dan transfer tanpa merekam rahasia.
