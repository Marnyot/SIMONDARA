import { Badge } from './ui/Badge';
import styles from './shell.module.css';
export function PageHeader({
  title,
  subtitle,
  online,
}: {
  title: string;
  subtitle: string;
  /** Device link of the room this page shows; omit on pages about no single room. */
  online?: boolean;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {online === undefined ? null : (
        <Badge tone={online ? 'safe' : 'danger'}>
          {online ? 'Terhubung' : 'Terputus'}
        </Badge>
      )}
    </header>
  );
}
