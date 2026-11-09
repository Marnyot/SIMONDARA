import { ChartLine as ChartNoAxesCombined } from '@phosphor-icons/react/dist/csr/ChartLine';
import { House } from '@phosphor-icons/react/dist/csr/House';
import { SquaresFour as LayoutGrid } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { SignOut as LogOut } from '@phosphor-icons/react/dist/csr/SignOut';
import { GearSix as Settings2 } from '@phosphor-icons/react/dist/csr/GearSix';
import { SlidersHorizontal } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { UserCircle as CircleUserRound } from '@phosphor-icons/react/dist/csr/UserCircle';
import type { Icon } from '@phosphor-icons/react';
import {
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigationType,
} from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/context';
import { roomUrl } from '../features/kamar/rooms';
import { useLive } from '../live/context';
import { Brand } from './Brand';
import { ThemeSwitch } from './ThemeSwitch';
import { Button } from './ui/Button';
import { Toaster } from './Toaster';
import styles from './shell.module.css';
interface NavigationItem {
  to: string;
  label: string;
  Icon: Icon;
}
const mainNavigation: NavigationItem[] = [
  { to: '/', label: 'Daftar Kamar', Icon: LayoutGrid },
  { to: '/kelola', label: 'Kelola', Icon: Settings2 },
];
const roomNavigation = (deviceId: string): NavigationItem[] => [
  { to: roomUrl(deviceId), label: 'Beranda', Icon: House },
  {
    to: roomUrl(deviceId, 'kontrol'),
    label: 'Kontrol',
    Icon: SlidersHorizontal,
  },
  {
    to: roomUrl(deviceId, 'riwayat'),
    label: 'Riwayat',
    Icon: ChartNoAxesCombined,
  },
];

function SidebarLinks({ items }: { items: NavigationItem[] }) {
  return items.map(({ to, label, Icon }) => (
    <NavLink
      viewTransition
      key={to}
      to={to}
      end
      className={({ isActive }) =>
        `${styles.navItem} ${isActive ? styles.active : ''}`
      }
    >
      <Icon size={20} aria-hidden="true" />
      {label}
    </NavLink>
  ));
}

export function AppShell() {
  const { logout } = useAuth();
  const { rooms, connection } = useLive();
  const roomMatch = useMatch('/kamar/:deviceId/*');
  const room = rooms.find(
    ({ deviceId }) => deviceId === roomMatch?.params.deviceId,
  );
  const roomItems = room ? roomNavigation(room.deviceId) : null;
  const connected = rooms.filter(({ online }) => online).length;
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  // A drill-down must not open scrolled to where the list was; Back keeps the browser's position.
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navigationType]);
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
      {/* Stays mounted so screen readers announce the text when it appears. */}
      <div role="status" className={styles.connectionBanner}>
        {connection === 'reconnecting' ? (
          <p>Koneksi ke server putus, sedang menyambung lagi…</p>
        ) : null}
      </div>
      <Toaster />
      <aside className={styles.sidebar} data-shell="sidebar">
        <Brand />
        <nav aria-label="Navigasi utama desktop" className={styles.desktopNav}>
          <SidebarLinks items={mainNavigation} />
        </nav>
        {room && roomItems ? (
          <nav
            aria-label={`Navigasi ${room.name}`}
            className={styles.desktopNav}
          >
            <p className={styles.navGroup} title={room.name}>
              <span>{room.name}</span>
            </p>
            <SidebarLinks items={roomItems} />
          </nav>
        ) : null}
        <div className={styles.sidebarBottom}>
          <p className={styles.fleet}>
            {rooms.length ? (
              <span>
                <span className="tabular-nums">
                  {connected}/{rooms.length}
                </span>{' '}
                perangkat terhubung
              </span>
            ) : (
              'Belum ada kamar'
            )}
          </p>
          <ThemeSwitch labelled />
          <Button
            variant="ghost"
            loading={loggingOut}
            onClick={() => void leave()}
          >
            <LogOut size={18} aria-hidden="true" />
            Keluar
          </Button>
        </div>
      </aside>
      <div className={styles.mobileTop} data-shell="header">
        <Brand />
        <Button
          variant="ghost"
          aria-label="Menu akun"
          popoverTarget="account-menu"
        >
          <CircleUserRound size={22} aria-hidden="true" />
        </Button>
        <div id="account-menu" popover="auto" className={styles.accountMenu}>
          <h2>Akun</h2>
          <ThemeSwitch labelled />
          <Button
            variant="ghost"
            loading={loggingOut}
            onClick={() => void leave()}
          >
            <LogOut size={18} aria-hidden="true" />
            Keluar
          </Button>
        </div>
      </div>
      <main id="main" className={styles.main} tabIndex={-1}>
        {error ? (
          <p role="alert" className={styles.banner}>
            {error}
          </p>
        ) : null}
        <Outlet />
      </main>
      <nav
        data-shell="nav"
        aria-label={room ? `Navigasi ${room.name}` : 'Navigasi utama mobile'}
        className={styles.bottomNav}
        style={
          {
            '--tab-count': (roomItems ?? mainNavigation).length,
            '--tab-index': Math.max(
              0,
              (roomItems ?? mainNavigation).findIndex(
                ({ to }) => to === (pathname.replace(/\/$/, '') || '/'),
              ),
            ),
          } as React.CSSProperties
        }
      >
        <span
          aria-hidden="true"
          data-nav-indicator
          className={styles.bottomIndicator}
        />
        {(roomItems ?? mainNavigation).map(({ to, label, Icon }) => (
          <NavLink
            viewTransition
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `${styles.bottomItem} ${isActive ? styles.bottomActive : ''}`
            }
          >
            <span className={styles.bottomIcon}>
              <Icon size={22} aria-hidden="true" />
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
