import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
export default function Kontrol() {
  return (
    <>
      <PageHeader
        title="Kontrol"
        subtitle="Atur perangkat dan mode sistem ruangan"
      />
      <Card>
        <EmptyState title="Kontrol">
          Data dan fitur halaman ini akan ditampilkan di sini.
        </EmptyState>
      </Card>
    </>
  );
}
