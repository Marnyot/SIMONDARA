import { useLive } from '../live/context';
import { Badge } from './ui/Badge';
import { StatusDot } from './ui/StatusDot';
import styles from './shell.module.css';
export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const { online } = useLive();
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <Badge tone={online ? 'safe' : 'neutral'}>
        <StatusDot />
        {online ? 'Terhubung' : 'Terputus'}
      </Badge>
    </header>
  );
}
