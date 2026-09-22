import { requireSession } from '@/features/auth/server-session';
import { PostEditor } from '@/features/posts/post-editor';

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, route] = await Promise.all([requireSession(), params]);
  return <PostEditor channels={session.workspace.channels} postId={route.id} />;
}
