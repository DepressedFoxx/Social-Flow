import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_MEDIA_SIZE = 5 * 1024 * 1024;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMediaUploadDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  filename!: string;

  @IsIn(MEDIA_TYPES)
  mimeType!: (typeof MEDIA_TYPES)[number];

  @IsInt()
  @Min(1)
  @Max(MAX_MEDIA_SIZE)
  size!: number;
}

export class ListMediaDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(180)
  q?: string;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export interface UploadedMediaFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
