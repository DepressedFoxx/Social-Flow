import { requireSession } from '@/features/auth/server-session';
import { PostList } from '@/features/posts/post-list';
import type { PostFilters } from '@/features/posts/types';

function one(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, raw] = await Promise.all([requireSession(), searchParams]);
  const page = Number(one(raw.page));
  const sort = one(raw.sort);
  const order = one(raw.order);
  const status = one(raw.status).toLowerCase();
  const statuses = ['draft', 'scheduled', 'publishing', 'published', 'failed'];
  const filters: PostFilters = {
    q: one(raw.q).slice(0, 200),
    status: statuses.includes(status) ? status : '',
    channel: one(raw.channel),
    sort: sort === 'scheduledAt' ? 'scheduledAt' : 'updatedAt',
    order: order === 'asc' ? 'asc' : 'desc',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
  return (
    <PostList
      key={JSON.stringify(filters)}
      initialFilters={filters}
      channels={session.workspace.channels}
    />
  );
}
