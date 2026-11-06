import { Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import Beranda from './pages/Beranda';
import DaftarKamar from './pages/DaftarKamar';
import KelolaKamar from './pages/KelolaKamar';
import Kontrol from './pages/Kontrol';
import Riwayat from './pages/Riwayat';
import RoomLayout from './pages/RoomLayout';
import Login from './pages/Login';
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DaftarKamar />} />
            <Route path="kelola" element={<KelolaKamar />} />
            <Route path="kamar/:deviceId" element={<RoomLayout />}>
              <Route index element={<Beranda />} />
              <Route path="kontrol" element={<Kontrol />} />
              <Route path="riwayat" element={<Riwayat />} />
            </Route>
          </Route>
        </Route>
        {/* Also covers the old single-device /kontrol and /riwayat URLs. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
