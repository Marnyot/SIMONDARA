/** Forward follows room depth, then the visible Beranda → Kontrol → Riwayat order. */
export function transitionDirection(
  from: string,
  to: string,
): 'forward' | 'back' {
  const rank = (path: string) => {
    if (!path.startsWith('/kamar/')) return path === '/kelola' ? 1 : 0;
    const tab = path.split('/')[3];
    return 2 + (tab === 'riwayat' ? 2 : tab === 'kontrol' ? 1 : 0);
  };
  return rank(to) < rank(from) ? 'back' : 'forward';
}
