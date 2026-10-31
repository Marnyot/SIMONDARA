import styles from './shell.module.css';
export function Brand({ splash = false }: { splash?: boolean }) {
  return (
    <div className={splash ? styles.splashBrand : styles.brand}>
      {splash ? <img src="/logo.svg" width="72" height="72" alt="" /> : null}
      <strong>SIMONDARA</strong>
      <span>Sistem Monitoring Udara</span>
    </div>
  );
}
