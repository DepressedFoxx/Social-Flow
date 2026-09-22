import { requireSession } from '@/features/auth/server-session';
import { PostEditor } from '@/features/posts/post-editor';

export default async function NewPostPage() {
  const session = await requireSession();
  return <PostEditor channels={session.workspace.channels} />;
}
