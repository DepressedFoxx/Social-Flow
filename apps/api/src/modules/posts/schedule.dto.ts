import { IsInt, IsISO8601, Matches, Min } from 'class-validator';
export class SchedulePostDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt!: string;
}

export class PublishNowDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
