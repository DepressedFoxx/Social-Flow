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
    isActive: boolean;
  };
  media: PostMedia[];
  attempts: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    externalPostId: string | null;
  }[];
};

export type PostMedia = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  position: number;
  contentPath: string;
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
