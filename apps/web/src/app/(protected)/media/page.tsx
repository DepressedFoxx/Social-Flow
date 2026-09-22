import { MediaLibrary } from '@/features/media/media-library';
import type { MediaFilters } from '@/features/media/types';

function one(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const page = Number(one(raw.page));
  const filters: MediaFilters = {
    q: one(raw.q).slice(0, 180),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
  return <MediaLibrary key={JSON.stringify(filters)} initialFilters={filters} />;
}
