import { Navigate, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from './context';
import { useLive } from '../live/context';
import { LiveProvider } from '../live/LiveProvider';
import { Splash } from '../components/Splash';
import { ErrorState } from '../components/ui/ErrorState';
function DataGate() {
  const { ready, error, retry } = useLive();
  const [shownReady, setShownReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(
      () => setShownReady(true),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
    );
    return () => window.clearTimeout(timer);
  }, [ready]);
  if (ready && shownReady) return <Outlet />;
  if (!ready && error) return <ErrorState message={error} onRetry={retry} />;
  return <Splash phase={ready ? 'ready' : 'snapshot'} />;
}
export function ProtectedRoute() {
  const { status, error, retry } = useAuth();
  if (status === 'loading') return <Splash phase="auth" />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (status === 'error')
    return (
      <ErrorState
        message={error ?? 'Pemeriksaan sesi gagal.'}
        onRetry={retry}
      />
    );
  return (
    <LiveProvider>
      <DataGate />
    </LiveProvider>
  );
}
