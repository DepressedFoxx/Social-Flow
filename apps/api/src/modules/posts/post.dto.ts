import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const statuses = ['DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED'] as const;
const sorts = ['updatedAt', 'scheduledAt'] as const;
const orders = ['asc', 'desc'] as const;
export type PostStatusFilter = (typeof statuses)[number];

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListPostsDto {
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsIn(statuses)
  status?: PostStatusFilter;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  channel?: string;

  @IsOptional()
  @IsIn(sorts)
  sort: (typeof sorts)[number] = 'updatedAt';

  @IsOptional()
  @IsIn(orders)
  order: (typeof orders)[number] = 'desc';

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

export class CreatePostDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsString()
  @MaxLength(2000)
  content = '';

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  channelId!: string;

  @IsUUID()
  clientRequestId!: string;

  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  mediaAssetIds: string[] = [];
}

export class UpdatePostDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  channelId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  mediaAssetIds?: string[];
}
