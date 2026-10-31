import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { useAuth } from '../auth/context';
import { Brand } from '../components/Brand';
import { Splash } from '../components/Splash';
import { ErrorState } from '../components/ui/ErrorState';
import { Button } from '../components/ui/Button';
import styles from './Login.module.css';
export default function Login() {
  const { status, error: authError, login, retry } = useAuth();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      await login(password);
      setPassword('');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Tidak dapat masuk. Silakan coba lagi.',
      );
    } finally {
      setLoading(false);
    }
  };
  if (status === 'loading') return <Splash phase="auth" />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return (
    <main className={styles.page}>
      <Brand splash />
      <div className={styles.formPanel}>
        <h1>Selamat datang</h1>
        <p>Masuk untuk memantau udara ruangan Anda.</p>
        {status === 'error' ? (
          <ErrorState
            message={authError ?? 'Pemeriksaan sesi gagal.'}
            onRetry={retry}
          />
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="password">Kata sandi pengelola</label>
            <div className={styles.inputGroup}>
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                disabled={loading}
              />
            </div>
            {error ? (
              <p id="login-error" role="alert" className={styles.error}>
                {error}
              </p>
            ) : null}
            <Button type="submit" loading={loading} disabled={!password}>
              {loading ? 'Memeriksa...' : 'Masuk'}
            </Button>
          </form>
        )}
      </div>
      <p className={styles.footer}>
        Sistem Monitoring dan Peringatan Dini Kualitas Udara
      </p>
    </main>
  );
}
