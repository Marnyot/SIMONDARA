# SIMONDARA Web

Fondasi PWA React + TypeScript strict. Desain mengikuti `../docs/design/README.md` dan screenshot Figma; kontrak mengikuti `../docs/CONTRACT.md`. Node.js 24 dan npm diperlukan.

## Menjalankan

```sh
cd web
npm ci
npm run dev
```

Vite melayani port 5173 dan meneruskan `/api` ke `http://localhost:8080`. Jalankan backend terlebih dahulu. Browser hanya menggunakan URL relatif dan cookie sesi same-origin; tidak ada kredensial MQTT atau kata sandi backend di bundle web.

| Script              | Fungsi                                                        |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Server pengembangan                                           |
| `npm run build`     | Pemeriksaan TypeScript dan build produksi beserta manifest/SW |
| `npm run preview`   | Memeriksa hasil build lokal                                   |
| `npm run typecheck` | TypeScript strict tanpa emit                                  |
| `npm run lint`      | ESLint flat config, tanpa warning                             |
| `npm run format`    | Prettier                                                      |
| `npm test`          | Vitest + Testing Library sekali jalan                         |
| `npm run icons`     | Membuat ulang ikon PNG dari `public/logo.svg`                 |

## Fitur dan rute

Satu kamar = satu perangkat NodeMCU dengan `deviceId` unik. Semua rute selain `/login` butuh sesi.

| Rute                                   | Halaman                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                    | Daftar Kamar: kartu tiap kamar (nama, status Aman/Waspada/Bahaya, terhubung/terputus, suhu, kelembapan, gas, kipas), empty state saat belum ada kamar, dan kartu "Perangkat baru terdeteksi" dengan aksi Tambah. |
| `/kamar/:deviceId`                     | Beranda kamar: status besar, sensor, aktuator, tren gas 24 jam (desktop).                                                                                                                                        |
| `/kamar/:deviceId/kontrol`             | Kontrol kamar: mode, kipas, buzzer, LED, bisukan alarm, pratinjau LCD, koneksi.                                                                                                                                  |
| `/kamar/:deviceId/riwayat`             | Riwayat kamar: grafik 1 jam/24 jam/7 hari dan peristiwa terakhir.                                                                                                                                                |
| `/kelola` (`?deviceId=` untuk prefill) | Kelola Kamar: tambah (ID perangkat + nama, atau dari perangkat baru), ubah nama, hapus dengan konfirmasi.                                                                                                        |

`deviceId` yang tidak terdaftar menampilkan "Kamar tidak ditemukan". `/kontrol`, `/riwayat`, dan rute tak dikenal lainnya diarahkan ke `/`. Navigasi: Daftar Kamar dan Kelola di tingkat utama; di dalam kamar, tab bar mobile berganti menjadi Beranda/Kontrol/Riwayat, sidebar desktop menambah grup nama kamar, dan tautan kembali ke daftar tampil di atas konten.

Indikator terputus dibedakan: kamar offline memakai badge merah "Terputus" per kamar dengan nilai terakhir diredupkan, sedangkan koneksi web ke server memakai banner merah tipis di atas halaman yang hilang otomatis saat tersambung.

Gangguan perangkat keras (`state.fault`: 1 DHT11, 2 MQ-135, 4 LCD; firmware lama dianggap 0) tampil sebagai badge kuning "Gangguan: <komponen>" di kartu kamar dan Beranda, rincian per komponen di kartu Koneksi, dan penanda "tidak andal" pada nilai sensor yang terdampak.

Notifikasi toast (pojok atas, tutup otomatis 6 detik, jeda saat disorot/difokus, maksimal 3, Bahaya memakai `role="alert"`) muncul saat kamar terdaftar naik ke Bahaya, kembali Aman setelah Bahaya, terputus, kembali online, mengalami gangguan, atau pulih dari gangguan, serta saat perangkat baru terdeteksi (aksi Tambah). Pemicunya ada di `live/reducer.ts`: `rooms` pertama tiap koneksi SSE menjadi baseline sehingga snapshot connect/reconnect tidak memunculkan toast.

## Struktur dan integrasi halaman

- `src/api/types.ts`: tipe dan validasi Zod untuk Telemetry, DeviceState, Snapshot, Room, UnregisteredDevice, HistoryPoint, Event, Command, serta aturan form `deviceIdSchema` dan `roomNameSchema`.
- `src/api/client.ts`: API client, ApiError (status 0 untuk kegagalan jaringan; `code` berisi `error` dari body, mis. `name_exists`), `api`, `sendCommand`. Semua request memakai cookie same-origin, no-store, dan timeout. Respons divalidasi pada batas jaringan. Setiap 401 selain login mengakhiri sesi lokal.
- `src/auth/`: provider sesi, `useAuth()` dari `context.ts`, dan guard route. Logout menunggu backend menghapus cookie; bila gagal pengguna dapat mencoba kembali.
- `src/live/`: `useLive()` dan `useRoom()` dari `context.ts`, provider dengan satu SSE untuk semua kamar dan reconnect eksponensial 1–30 detik + jitter, parser/reducer per `deviceId`, serta ambang dan label status terpusat di `status.ts`.
- `src/components/`: AppShell desktop/mobile, Toaster, PageHeader, Brand, Splash.
- `src/components/ui/`: komponen bernama `Card`, `Button`, `Toggle`, `SegmentedControl`, `Badge`/`StatusPill`, `StatusDot`, `Skeleton`, `EmptyState`, `ErrorState`, `TextField`, `ConfirmDialog`; impor langsung dari masing-masing file.
- `src/features/kamar/`: kartu kamar, perangkat baru, form dan baris Kelola, serta `rooms.ts` (URL, status kartu, validasi, pesan error kamar).
- `src/pages/`: `DaftarKamar.tsx`, `KelolaKamar.tsx`, `RoomLayout.tsx` (konteks kamar, tautan kembali, kamar tidak ditemukan), serta `Beranda.tsx`, `Kontrol.tsx`, `Riwayat.tsx` di dalam `RoomLayout`; semuanya default export dan logika halaman tetap di file masing-masing. `Login.tsx` menangani form password.
- `src/styles/tokens.css`: seluruh token global; komponen memakai CSS Modules tanpa Tailwind.

Halaman sudah berada dalam AuthProvider dan LiveProvider. `useLive()` memberikan `rooms`, `unregistered`, `connection` (`connecting | connected | reconnecting`), `ready`, `error`, `retry()`, `notices`, `dismissNotice(id)`, serta `createRoom`, `renameRoom`, `deleteRoom`. Di dalam `/kamar/:deviceId`, `useRoom()` memberikan data satu kamar: `deviceId`, `name`, `state`, `telemetry` (nullable sebelum perangkat mengirim data), `online`, `updatedAt` (ISO atau null), `connection`, dan `sendCommand(command)`. Nilai numerik mode, status dan aktuator mengikuti kontrak. Jangan menganggap koneksi SSE sama dengan online perangkat; timestamp selalu diperiksa null sebelum diformat. `PageHeader` menerima `title`, `subtitle`, dan `online` opsional untuk badge perangkat.

`api.history(deviceId, fromISO, toISO, bucket, signal?)` mengembalikan `{ points }`; `api.events(deviceId, limit?, signal?)` mengembalikan `{ events }`. `sendCommand({ mode: 1, fan: 1 })` dari `useRoom()` mengembalikan Promise<void>; tidak mengubah state secara optimistis: tunggu konfirmasi SSE dari perangkat. Gunakan AbortSignal pada fetch halaman dan tangkap ApiError untuk UI error. Toggle menerima `label`, `checked`, `onChange`, `disabled`; SegmentedControl menerima `label`, `value`, `onChange`, `options: [{ value, label, disabled? }]`.

Splash menunjukkan pemeriksaan sesi, pemuatan daftar kamar REST/SSE, lalu Siap. `GET /api/rooms` dijalankan bersama SSE agar aplikasi tetap terisi bila stream lambat; begitu event `rooms` tiba, stream menjadi sumber kebenaran dan respons REST yang terlambat diabaikan. Hasil tambah/ubah/hapus langsung diterapkan dari respons API sehingga UI tetap benar saat stream terputus. Event untuk perangkat yang tidak ada di daftar diabaikan. Kegagalan awal menampilkan tombol coba lagi; sesudah tersambung data terakhir dipertahankan selama reconnect. EventSource tidak mengekspos HTTP status; kegagalan stream memicu probe sesi untuk mendeteksi 401. prefers-reduced-motion dihormati.

## Deploy Vercel

1. Pilih **Add New → Project**, impor repositori `Marnyot/SIMONDARA`.
2. Tetapkan **Root Directory** ke `web` dan **Framework Preset** ke Vite. Build `npm run build` dan output `dist` memakai default; Node.js 24.x. Vercel membaca `web/vercel.json`.
3. `web/vercel.json` me-rewrite `/api/*` ke `https://simondara-production.up.railway.app/api/*` sebelum fallback SPA ke `/index.html`. Jika domain Railway berubah, ganti target ini lalu deploy ulang.
4. Atur `WEB_ORIGIN` pada service backend Railway ke origin HTTPS Vercel persis, misalnya `https://simondara.vercel.app`, tanpa trailing slash. Browser tetap memanggil `/api` relatif melalui rewrite Vercel sehingga cookie sesi menjadi first-party; login, `/api/auth/me`, dan `/api/stream` harus melewati rewrite yang sama.
5. Deploy dan periksa `/api/health`, login, `/api/auth/me`, SSE, serta muat ulang langsung di `/kamar/<deviceId>/kontrol` dan `/kamar/<deviceId>/riwayat`.

Tidak perlu env web atau membocorkan URL broker ke browser.

Rewrite eksternal Vercel dapat memutus request yang berjalan lama, sehingga SSE `/api/stream` dapat terputus dan tersambung ulang secara berkala. `LiveProvider` sudah menangani reconnect dengan backoff 1–30 detik dan jitter, sementara backend mengirim `rooms` dan snapshot terbaru setiap koneksi; data terakhir tetap ditampilkan selama reconnect.

## PWA

`vite-plugin-pwa` membuat `dist/manifest.webmanifest`, `dist/sw.js` dan Workbox dari aset statis. Registrasi auto-update memakai update worker baru; app shell, font Inter lokal, dan ikon diprecache. Semua `/api` GET memakai NetworkOnly dan tidak masuk fallback navigasi; mutasi/API SSE tidak dicache. Data sensor dan sesi tidak disimpan offline. App shell bisa dibuka offline setelah instalasi, tetapi sesi/data memerlukan backend dan menampilkan recovery saat tidak tersedia. Ikon regular 192/512, maskable 512 dengan safe area, dan apple-touch-icon 180 dibuat dari SVG lokal.

PWA hanya aktif pada build produksi di HTTPS atau localhost. Jalankan `npm run build && npm run preview`, lalu cek Application → Manifest/Service Workers pada DevTools. Hapus service worker lama saat menguji perubahan konfigurasi cache. Instal melalui menu browser atau Add to Home Screen di iOS.

Referensi implementasi: [Vite PWA GenerateSW](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/docs/workbox/generate-sw.md) dan [React Router declarative routing](https://reactrouter.com/start/declarative/routing).
