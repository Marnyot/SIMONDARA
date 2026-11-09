import { Warning as TriangleAlert } from '@phosphor-icons/react/dist/csr/Warning';
import { faultLabels } from '../live/status';
import { Badge } from './ui/Badge';
import styles from './ui/ui.module.css';

export function FaultBadge({ fault }: { fault: number }) {
  const labels = faultLabels(fault);
  if (!labels) return null;
  return (
    <Badge tone="warning" className={styles.faultBadge}>
      <TriangleAlert size={14} aria-hidden="true" />
      Gangguan: {labels}
    </Badge>
  );
}
