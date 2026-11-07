import {
  ChartNoAxesCombined,
  House,
  LayoutGrid,
  LogOut,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  UNSAFE_ViewTransitionContext,
  NavLink,
  Outlet,
  useLocation,
  useMatch,
  useNavigationType,
} from 'react-router-dom';
import { useContext, useEffect, useLayoutEffect, useState } from 'react';
import { transitionDirection } from './motion';
import { useAuth } from '../auth/context';
import { roomUrl } from '../features/kamar/rooms';
import { useLive } from '../live/context';
import { Brand } from './Brand';
import { ThemeSwitch } from './ThemeSwitch';
import { Button } from './ui/Button';
import { Toaster } from './Toaster';
import { StatusDot } from './ui/StatusDot';
import styles from './shell.module.css';
interface NavigationItem {
  to: string;
  label: string;
  Icon: LucideIcon;
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
  const transition = useContext(UNSAFE_ViewTransitionContext);
  useLayoutEffect(() => {
    if (!transition.isTransitioning) return;
    document.documentElement.dataset.routeTransition = '';
    document.documentElement.dataset.routeDirection = transitionDirection(
      transition.currentLocation.pathname,
      transition.nextLocation.pathname,
    );
    return () => {
      delete document.documentElement.dataset.routeTransition;
    };
  }, [transition]);
  const { logout } = useAuth();
  const { rooms, connection } = useLive();
  const roomMatch = useMatch('/kamar/:deviceId/*');
  const room = rooms.find(
    ({ deviceId }) => deviceId === roomMatch?.params.deviceId,
  );
  const roomItems = room ? roomNavigation(room.deviceId) : null;
  const connected = rooms.filter(({ online }) => online).length;
  const fleetColor = !rooms.length
    ? 'var(--color-muted)'
    : connected === rooms.length
      ? 'var(--color-safe)'
      : connected
        ? 'var(--color-warning)'
        : 'var(--color-danger)';
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
      <aside className={styles.sidebar}>
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
            <StatusDot color={fleetColor} />
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
      <div className={styles.mobileTop}>
        <Brand />
        <ThemeSwitch />
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
        <Outlet />
      </main>
      <nav
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
