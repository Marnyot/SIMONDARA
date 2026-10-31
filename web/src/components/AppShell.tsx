import {
  ChartNoAxesCombined,
  House,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/context';
import { useLive } from '../live/context';
import { Brand } from './Brand';
import { Button } from './ui/Button';
import { StatusDot } from './ui/StatusDot';
import styles from './shell.module.css';
const navigation = [
  { to: '/', label: 'Beranda', Icon: House },
  { to: '/kontrol', label: 'Kontrol', Icon: SlidersHorizontal },
  { to: '/riwayat', label: 'Riwayat', Icon: ChartNoAxesCombined },
];
export function AppShell() {
  const { logout } = useAuth();
  const { online, connection } = useLive();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leave = async () => {
    setLoggingOut(true);
    setError(null);
    try {
      await logout();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Gagal keluar. Coba lagi.',
      );
    } finally {
      setLoggingOut(false);
    }
  };
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Lewati ke konten
      </a>
      <aside className={styles.sidebar}>
        <Brand />
        <nav aria-label="Navigasi utama desktop" className={styles.desktopNav}>
          {navigation.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.deviceCard}>
            <strong>
              <StatusDot
                color={online ? 'var(--color-safe)' : 'var(--color-muted)'}
              />
              Perangkat {online ? 'terhubung' : 'terputus'}
            </strong>
            <span>NodeMCU ESP8266</span>
          </div>
          <Button
            variant="ghost"
            loading={loggingOut}
            onClick={() => void leave()}
          >
            <LogOut size={16} aria-hidden="true" />
            Keluar
          </Button>
        </div>
      </aside>
      <div className={styles.mobileTop}>
        <Brand />
        <Button
          variant="ghost"
          aria-label="Keluar dari akun"
          loading={loggingOut}
          onClick={() => void leave()}
        >
          <LogOut size={20} aria-hidden="true" />
        </Button>
      </div>
      <main id="main" className={styles.main} tabIndex={-1}>
        {error ? (
          <p role="alert" className={styles.banner}>
            {error}
          </p>
        ) : null}
        {connection !== 'connected' ? (
          <p role="status" className={styles.banner}>
            Koneksi server{' '}
            {connection === 'connecting'
              ? 'sedang disiapkan'
              : 'terputus, menghubungkan kembali'}
            . Data terakhir tetap ditampilkan.
          </p>
        ) : null}
        <Outlet />
      </main>
      <nav aria-label="Navigasi utama mobile" className={styles.bottomNav}>
        {navigation.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `${styles.bottomItem} ${isActive ? styles.bottomActive : ''}`
            }
          >
            <Icon size={22} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
