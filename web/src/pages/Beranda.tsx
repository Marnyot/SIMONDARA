import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
export default function Beranda() {
  return (
    <>
      <PageHeader
        title="Beranda"
        subtitle="Pantauan kualitas udara ruangan secara langsung"
      />
      <Card>
        <EmptyState title="Beranda">
          Data dan fitur halaman ini akan ditampilkan di sini.
        </EmptyState>
      </Card>
    </>
  );
}
