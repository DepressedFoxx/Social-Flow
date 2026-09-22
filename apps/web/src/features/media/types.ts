export type MediaLibraryItem = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  status: 'PENDING' | 'UPLOADED' | 'READY';
  createdAt: string;
  contentPath: string | null;
  post: { id: string; title: string } | null;
};

export type MediaLibraryData = {
  planCode: string;
  quotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  remainingBytes: number;
  items: MediaLibraryItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type MediaFilters = { q: string; page: number };
export const mediaKey = ['media'] as const;
