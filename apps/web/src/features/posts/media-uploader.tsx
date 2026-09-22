'use client';

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import Image from 'next/image';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sessionKey, type AuthSession } from '@/features/auth/types';
import { API_URL, ApiError, apiRequest } from '@/lib/api-client';
import type { PostMedia } from './types';

const MAX_FILES = 4;
const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type EditorMedia = PostMedia & {
  localId: string;
  previewUrl: string;
  status: 'uploading' | 'success' | 'error';
  error?: string;
  file?: File;
  persisted: boolean;
};

export function existingMedia(media: PostMedia[]): EditorMedia[] {
  return media.map((item) => ({
    ...item,
    localId: item.id,
    previewUrl: `${API_URL}${item.contentPath}?v=${encodeURIComponent(item.id)}`,
    status: 'success',
    persisted: true,
  }));
}

export function MediaUploader({
  value,
  onChange,
  disabled,
}: {
  value: EditorMedia[];
  onChange: Dispatch<SetStateAction<EditorMedia[]>>;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const [message, setMessage] = useState('');

  function replace(localId: string, update: (item: EditorMedia) => EditorMedia) {
    onChange((current) =>
      current.map((item) => (item.localId === localId ? update(item) : item)),
    );
  }

  async function upload(item: EditorMedia) {
    if (!item.file) return;
    replace(item.localId, (current) => ({
      ...current,
      status: 'uploading',
      error: undefined,
    }));
    try {
      const session = client.getQueryData<AuthSession>(sessionKey);
      const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': session?.csrfToken ?? '',
      };
      const init = await apiRequest<{ assetId: string; uploadUrl: string }>(
        '/media/upload-url',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            filename: item.file.name,
            mimeType: item.file.type,
            size: item.file.size,
          }),
        },
      );
      const body = new FormData();
      body.append('file', item.file);
      const uploaded = await fetch(API_URL + init.uploadUrl, { method: 'PUT', body });
      if (!uploaded.ok) {
        const failure = (await uploaded.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(failure?.message ?? 'Không thể upload file.');
      }
      const ready = await apiRequest<PostMedia>(`/media/${init.assetId}/complete`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': session?.csrfToken ?? '' },
      });
      replace(item.localId, (current) => ({
        ...current,
        ...ready,
        status: 'success',
        persisted: false,
      }));
    } catch (failure) {
      replace(item.localId, (current) => ({
        ...current,
        status: 'error',
        error:
          failure instanceof ApiError || failure instanceof Error
            ? failure.message
            : 'Không thể upload ảnh.',
      }));
    }
  }

  function selectFiles(files: FileList | null) {
    setMessage('');
    if (!files?.length) return;
    const available = MAX_FILES - value.length;
    if (files.length > available) setMessage(`Mỗi bài chỉ được tối đa ${MAX_FILES} ảnh.`);
    const accepted: EditorMedia[] = [];
    for (const file of Array.from(files).slice(0, available)) {
      if (!TYPES.includes(file.type)) {
        setMessage('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.');
        continue;
      }
      if (file.size > MAX_SIZE) {
        setMessage('Mỗi ảnh không được vượt quá 5 MB.');
        continue;
      }
      accepted.push({
        id: '',
        localId: crypto.randomUUID(),
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        position: value.length + accepted.length,
        contentPath: '',
        previewUrl: URL.createObjectURL(file),
        status: 'uploading',
        file,
        persisted: false,
      });
    }
    onChange((current) => [...current, ...accepted]);
    accepted.forEach((item) => void upload(item));
    if (input.current) input.current.value = '';
  }

  async function remove(item: EditorMedia) {
    onChange((current) => current.filter((media) => media.localId !== item.localId));
    if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    if (item.id && !item.persisted) {
      const session = client.getQueryData<AuthSession>(sessionKey);
      await apiRequest<void>(`/media/${item.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': session?.csrfToken ?? '' },
      }).catch(() => undefined);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    onChange((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, position) => ({ ...item, position }));
    });
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Ảnh bài viết</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            JPEG, PNG hoặc WebP · tối đa 4 ảnh · 5 MB mỗi ảnh
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          disabled={disabled || value.length >= MAX_FILES}
          onChange={(event) => selectFiles(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.length >= MAX_FILES}
          onClick={() => input.current?.click()}
        >
          <ImagePlus aria-hidden="true" /> Thêm ảnh
        </Button>
      </div>
      {message && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {message}
        </p>
      )}
      {value.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {value.map((item, index) => (
            <li key={item.localId} className="overflow-hidden rounded-lg border bg-card">
              <div className="relative aspect-video bg-muted">
                <Image
                  src={item.previewUrl}
                  alt={`Ảnh ${index + 1}: ${item.filename}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover"
                  unoptimized
                />
                {item.status === 'uploading' && (
                  <span className="absolute inset-0 flex items-center justify-center gap-2 bg-foreground/50 text-sm text-white">
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    Đang upload…
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-xs font-medium">{item.filename}</p>
                {item.status === 'error' && (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {item.error}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Đưa ${item.filename} sang trái`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowLeft aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Đưa ${item.filename} sang phải`}
                    disabled={disabled || index === value.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  {item.status === 'error' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Thử lại ${item.filename}`}
                      disabled={disabled}
                      onClick={() => void upload(item)}
                    >
                      <RefreshCw aria-hidden="true" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Xóa ${item.filename}`}
                    disabled={disabled}
                    onClick={() => void remove(item)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
