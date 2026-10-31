import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
export default function Riwayat() {
  return (
    <>
      <PageHeader
        title="Riwayat"
        subtitle="Lihat perubahan kualitas udara ruangan"
      />
      <Card>
        <EmptyState title="Riwayat">
          Data dan fitur halaman ini akan ditampilkan di sini.
        </EmptyState>
      </Card>
    </>
  );
}
