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

## Struktur dan integrasi halaman

- `src/api/types.ts`: tipe dan validasi Zod untuk Telemetry, DeviceState, Snapshot, HistoryPoint, Event, Command.
- `src/api/client.ts`: API client, ApiError (status 0 untuk kegagalan jaringan), `api`, `sendCommand`. Semua request memakai cookie same-origin, no-store, dan timeout. Respons divalidasi pada batas jaringan. Setiap 401 selain login mengakhiri sesi lokal.
- `src/auth/`: provider sesi, `useAuth()` dari `context.ts`, dan guard route. Logout menunggu backend menghapus cookie; bila gagal pengguna dapat mencoba kembali.
- `src/live/`: `useLive()` dari `context.ts`, provider SSE dengan reconnect eksponensial 1–30 detik + jitter, parser/reducer, serta ambang dan label status terpusat di `status.ts`.
- `src/components/`: AppShell desktop/mobile, PageHeader, Brand, Splash.
- `src/components/ui/`: komponen bernama `Card`, `Button`, `Toggle`, `SegmentedControl`, `Badge`/`StatusPill`, `StatusDot`, `Skeleton`, `EmptyState`, `ErrorState`; impor langsung dari masing-masing file.
- `src/pages/`: `Beranda.tsx`, `Kontrol.tsx`, `Riwayat.tsx` adalah titik kerja terpisah dengan default export; logika halaman tetap di file halaman masing-masing. `Login.tsx` menangani form password.
- `src/styles/tokens.css`: seluruh token global; komponen memakai CSS Modules tanpa Tailwind.

Halaman sudah berada dalam AuthProvider dan LiveProvider. Gunakan `PageHeader` untuk judul/subjudul dan badge online perangkat. `useLive()` memberikan `state`, `telemetry` (nullable sebelum perangkat mengirim data), `online`, `updatedAt` (ISO atau null), `connection` (`connecting | connected | reconnecting`), `ready`, `error`, `retry()` dan `sendCommand(command)`. Nilai numerik mode, status dan aktuator mengikuti kontrak. Jangan menganggap koneksi SSE sama dengan online perangkat; timestamp selalu diperiksa null sebelum diformat.

`api.history(fromISO, toISO, bucket, signal?)` mengembalikan `{ points }`; `api.events(limit?, signal?)` mengembalikan `{ events }`. `sendCommand({ mode: 1, fan: 1 })` mengembalikan Promise<void>; tidak mengubah state secara optimistis: tunggu konfirmasi SSE dari perangkat. Gunakan AbortSignal pada fetch halaman dan tangkap ApiError untuk UI error. Toggle menerima `label`, `checked`, `onChange`, `disabled`; SegmentedControl menerima `label`, `value`, `onChange`, `options: [{ value, label, disabled? }]`.

Splash menunjukkan pemeriksaan sesi, pemuatan snapshot REST/SSE, lalu Siap. Snapshot REST dijalankan bersama SSE agar perangkat baru tanpa data sensor dapat masuk tanpa nilai buatan. Snapshot SSE dianggap lengkap setelah state + online diterima, karena telemetri mungkin belum tersedia. Kegagalan awal menampilkan tombol coba lagi; sesudah tersambung data terakhir dipertahankan selama reconnect. EventSource tidak mengekspos HTTP status; kegagalan stream memicu probe sesi untuk mendeteksi 401. prefers-reduced-motion dihormati.

## Deploy Vercel

1. Buat project dari repo dan pilih **Root Directory: `web`**, Node.js 24, framework Vite, build `npm run build`, output `dist`.
2. Ganti `https://BACKEND_URL_RAILWAY` pada `vercel.json` dengan origin HTTPS backend Railway yang sebenarnya (tanpa slash akhir). Contoh: `https://simondara-production.up.railway.app/api/:path*`.
3. Atur `WEB_ORIGIN` backend ke origin Vercel dan pastikan cookie sesi aman, HTTP-only, serta proxy meneruskan Set-Cookie dan stream SSE tanpa buffering.
4. Deploy dan periksa login, `/api/auth/me`, SSE, serta muat ulang langsung di `/kontrol` dan `/riwayat`. Rewrite API ditulis lebih dahulu dan dikecualikan dari fallback SPA.

Placeholder backend wajib diganti sebelum deployment. Tidak perlu env web atau membocorkan URL broker ke browser.

## PWA

`vite-plugin-pwa` membuat `dist/manifest.webmanifest`, `dist/sw.js` dan Workbox dari aset statis. Registrasi auto-update memakai update worker baru; app shell, font Inter lokal, dan ikon diprecache. Semua `/api` GET memakai NetworkOnly dan tidak masuk fallback navigasi; mutasi/API SSE tidak dicache. Data sensor dan sesi tidak disimpan offline. App shell bisa dibuka offline setelah instalasi, tetapi sesi/data memerlukan backend dan menampilkan recovery saat tidak tersedia. Ikon regular 192/512, maskable 512 dengan safe area, dan apple-touch-icon 180 dibuat dari SVG lokal.

PWA hanya aktif pada build produksi di HTTPS atau localhost. Jalankan `npm run build && npm run preview`, lalu cek Application → Manifest/Service Workers pada DevTools. Hapus service worker lama saat menguji perubahan konfigurasi cache. Instal melalui menu browser atau Add to Home Screen di iOS.

Referensi implementasi: [Vite PWA GenerateSW](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/docs/workbox/generate-sw.md) dan [React Router declarative routing](https://reactrouter.com/start/declarative/routing).
