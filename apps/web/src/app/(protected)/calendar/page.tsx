import { CalendarView } from '@/features/calendar/calendar-view';
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; channel?: string }>;
}) {
  const query = await searchParams;
  const today = new Date(new Date().getTime() + 7 * 3600000).toISOString().slice(0, 7);
  const month =
    typeof query.month === 'string' && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(query.month)
      ? query.month
      : today;
  return (
    <CalendarView
      month={month}
      channel={typeof query.channel === 'string' ? query.channel : ''}
    />
  );
}
