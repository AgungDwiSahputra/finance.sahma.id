export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style:                 'currency',
    currency:              'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDateGroup(dateStr: string): string {
  const date      = new Date(dateStr + 'T00:00:00');
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const toKey = (d: Date) => d.toISOString().split('T')[0];
  if (dateStr === toKey(today))     return 'Hari ini';
  if (dateStr === toKey(yesterday)) return 'Kemarin';

  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
    year:    'numeric',
  });
}

export function getCurrentMonthRange(): { from: string; to: string } {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const from  = new Date(year, month, 1).toISOString().split('T')[0];
  const to    = new Date(year, month + 1, 0).toISOString().split('T')[0];
  return { from, to };
}

export function monthRangeFromFilter(value: string): { from: string; to: string } {
  const [year, month] = value.split('-').map(Number);
  const from = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const to   = new Date(year, month, 0).toISOString().split('T')[0];
  return { from, to };
}
