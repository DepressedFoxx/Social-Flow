export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

export type PostItem = {
  id: string;
  title: string;
  content: string;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  channel: {
    id: string;
    name: string;
    platform: 'FACEBOOK' | 'INSTAGRAM';
    isMock: boolean;
  };
};

export type PostListData = {
  items: PostItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type PostFilters = {
  q: string;
  status: string;
  channel: string;
  sort: 'updatedAt' | 'scheduledAt';
  order: 'asc' | 'desc';
  page: number;
};

export const postsKey = ['posts'] as const;
