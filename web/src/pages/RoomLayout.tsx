import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { sendCommand } from '../api/client';
import type { Command } from '../api/types';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import ui from '../components/ui/ui.module.css';
import { RoomContext, useLive } from '../live/context';
import styles from './RoomLayout.module.css';

export default function RoomLayout() {
  const { deviceId = '' } = useParams();
  const { rooms, connection } = useLive();
  const room = rooms.find((item) => item.deviceId === deviceId);
  const value = useMemo(
    () =>
      room && {
        ...room,
        connection,
        sendCommand: (command: Command) => sendCommand(room.deviceId, command),
      },
    [room, connection],
  );
  const back = (
    <Link viewTransition className={styles.back} to="/">
      <ArrowLeft size={18} aria-hidden="true" />
      Daftar Kamar
    </Link>
  );
  if (!value)
    return (
      <>
        {back}
        <PageHeader
          title="Kamar tidak ditemukan"
          subtitle={`Tidak ada kamar dengan ID perangkat ${deviceId}`}
        />
        <Card>
          <EmptyState
            title="Kamar ini tidak terdaftar"
            action={
              <Link viewTransition to="/" className={ui.button}>
                Buka Daftar Kamar
              </Link>
            }
          >
            Kamar mungkin sudah dihapus atau alamatnya keliru. Pilih kamar dari
            daftar untuk melanjutkan.
          </EmptyState>
        </Card>
      </>
    );
  return (
    <RoomContext.Provider value={value}>
      {back}
      {/* Pending commands and fetched history belong to one room only. */}
      <Outlet key={deviceId} />
    </RoomContext.Provider>
  );
}
