import { Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import Beranda from './pages/Beranda';
import Kontrol from './pages/Kontrol';
import Riwayat from './pages/Riwayat';
import Login from './pages/Login';
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Beranda />} />
            <Route path="kontrol" element={<Kontrol />} />
            <Route path="riwayat" element={<Riwayat />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
