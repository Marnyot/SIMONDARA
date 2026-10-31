# Desain UI SIMONDARA

Sumber: Figma "SIMONDARA-Mockup" (halaman Mobile 390×844, Desktop 1440×900). Screenshot di folder ini adalah acuan visual untuk worker.

| File | Isi |
| --- | --- |
| `mobile-splash.jpg` | Splash 1–5: latar hijau, logo, progress bar, teks bertahap ("Menghubungkan ke perangkat...", "Terhubung ke jaringan WiFi", ..., "Siap") lalu ke Beranda |
| `mobile-beranda.png`, `desktop-beranda.png` | Kartu status besar, kartu suhu/kelembapan/gas, status aktuator, (desktop) tren gas 24 jam |
| `mobile-kontrol.png`, `desktop-kontrol.png` | Buzzer toggle, mode (segmented Otomatis/Manual), pratinjau LCD, (desktop) kartu koneksi |
| `mobile-riwayat.png`, `desktop-riwayat.png` | Rentang 1 Jam/24 Jam/7 Hari, grafik suhu, kelembapan, gas (garis ambang kuning/merah), peristiwa terakhir |

## Pola layout

- Mobile: header + konten kartu + bottom nav (Beranda, Kontrol, Riwayat).
- Desktop: sidebar kiri (logo, nav, kartu "Perangkat terhubung" di bawah) + konten grid.
- Badge "Terhubung" di kanan atas = status online perangkat.

## Token visual (perkiraan dari screenshot)

- Latar app `#F4F7F6`, kartu putih, radius ±16 px, border tipis abu.
- Primer hijau tua (splash/nav aktif) ±`#0E7C66`; teks judul hijau sangat gelap ±`#12352B`.
- Status: hijau ±`#2EA05F`, kuning ±`#E8B10A` (latar kartu ±`#FFF1C9`), merah ±`#D9473F`.
- Font sans (mirip Inter), angka besar bold.

## Penyesuaian terhadap Figma (keputusan final)

1. Label status: **Aman / Waspada / Bahaya** (bukan Baik/Sedang/Buruk), warna tetap hijau/kuning/merah.
2. Ambang gas mengikuti laporan: kuning > 1.000 ppm, merah > 2.000 ppm. Teks kartu gas dan garis ambang grafik pakai angka ini.
3. Halaman Kontrol ditambah kartu **Kipas Exhaust** (toggle), gaya sama dengan kartu Buzzer.
4. "Mode LED" diganti **Mode Sistem** (Otomatis/Manual) yang berlaku untuk semua aktuator. Saat Otomatis, kontrol kipas/LED/buzzer tampil nonaktif dengan keterangan. Saat Manual, muncul pilihan LED (Mati/Hijau/Kuning/Merah), toggle kipas, toggle buzzer.
5. Tombol **Bisukan alarm** (mute) muncul saat status Bahaya (Beranda dan Kontrol).
6. Halaman **Login** baru: gaya splash (latar hijau, logo), satu input password.
7. Kartu Koneksi desktop: Perangkat = status online (LWT), Server = koneksi SSE ke backend, plus waktu data terakhir.
8. Pratinjau LCD dirender dari telemetri + status terakhir, format sama dengan LCD fisik.
9. Badge "Contoh data" di Figma dihapus (data asli).
