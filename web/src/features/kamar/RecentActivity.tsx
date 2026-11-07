import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Room } from '../../api/types';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusDot } from '../../components/ui/StatusDot';
import { LoadingSwap } from '../../components/ui/LoadingSwap';
import { Skeleton } from '../../components/ui/Skeleton';
import { describeEvent, formatDateTime } from '../riwayat/history';
import { formatRelativeTime, useNow } from '../kontrol/time';
import { mergeRoomEvents } from './activity';
import { roomUrl } from './rooms';
import styles from './DaftarKamar.module.css';

type Activity = ReturnType<typeof mergeRoomEvents>;

export function RecentActivity({ rooms }: { rooms: Room[] }) {
  // Membership alone drives requests, not every live telemetry update or rename.
  const roomIds = JSON.stringify(rooms.map((room) => room.deviceId).sort());
  const [result, setResult] = useState<{
    key: string;
    events: Activity;
    failed: boolean;
    initialKeys: Set<string>;
  } | null>(null);
  const now = useNow(30_000);
  useEffect(() => {
    const controller = new AbortController();
    const ids = JSON.parse(roomIds) as string[];
    async function refresh() {
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(15_000),
      ]);
      const batches = await Promise.allSettled(
        ids.map(async (deviceId) => ({
          deviceId,
          name: '',
          ...(await api.events(deviceId, 12, signal)),
        })),
      );
      if (!controller.signal.aborted)
        setResult((previous) => ({
          initialKeys:
            previous?.initialKeys ??
            new Set(
              batches.flatMap((batch) =>
                batch.status === 'fulfilled'
                  ? batch.value.events.map(
                      (event) =>
                        `${batch.value.deviceId}-${event.at}-${event.type}`,
                    )
                  : [],
              ),
            ),
          key: roomIds,
          events: mergeRoomEvents(
            batches.flatMap((batch) =>
              batch.status === 'fulfilled' ? [batch.value] : [],
            ),
          ),
          failed: batches.some((batch) => batch.status === 'rejected'),
        }));
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [roomIds]);
  const current = result?.key === roomIds ? result : null;
  return (
    <Card className={styles.activity}>
      <h2>Aktivitas terbaru</h2>
      <LoadingSwap
        loading={!current}
        skeleton={
          <div
            className={styles.activitySkeleton}
            role="status"
            aria-label="Memuat aktivitas terbaru"
          >
            {[0, 1, 2].map((row) => (
              <div key={row}>
                <Skeleton height={16} label="Memuat nama kamar" />
                <Skeleton height={14} label="Memuat peristiwa" />
                <Skeleton height={12} label="Memuat waktu" />
              </div>
            ))}
          </div>
        }
      >
        {current?.events.length ? (
          <ul>
            {current.events
              .slice(0, rooms.length > 1 ? 5 : 3)
              .map((event, index) => {
                const { text, color } = describeEvent(event);
                return (
                  <li
                    className={
                      current.initialKeys.has(
                        `${event.deviceId}-${event.at}-${event.type}`,
                      )
                        ? 'motion-content'
                        : undefined
                    }
                    style={{ animationDelay: `${index * 40}ms` }}
                    key={`${event.deviceId}-${event.at}-${event.type}`}
                  >
                    <StatusDot color={color} />
                    <div>
                      <Link
                        viewTransition
                        to={roomUrl(event.deviceId, 'riwayat')}
                      >
                        {rooms.find((room) => room.deviceId === event.deviceId)
                          ?.name ?? event.deviceId}
                      </Link>
                      <p>{text}</p>
                      <time
                        dateTime={event.at}
                        title={formatDateTime(event.at)}
                      >
                        {formatRelativeTime(event.at, now)}
                      </time>
                    </div>
                  </li>
                );
              })}
          </ul>
        ) : (
          <EmptyState
            title={
              current?.failed
                ? 'Aktivitas belum tersedia'
                : 'Belum ada peristiwa'
            }
          >
            {current?.failed
              ? 'Aktivitas dimuat ulang sebentar lagi.'
              : 'Perubahan kondisi udara dan koneksi tiap kamar muncul di sini.'}
          </EmptyState>
        )}
      </LoadingSwap>
    </Card>
  );
}
