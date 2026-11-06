import { Badge } from './ui/Badge';
import { StatusDot } from './ui/StatusDot';
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
          <StatusDot />
          {online ? 'Terhubung' : 'Terputus'}
        </Badge>
      )}
    </header>
  );
}
