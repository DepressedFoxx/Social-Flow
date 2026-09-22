import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import type { AuthRequest } from '../auth/auth.types';
import { CreatePostDto, ListPostsDto, UpdatePostDto } from './post.dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@Controller('posts')
@UseGuards(SessionGuard)
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthRequest, @Query() query: ListPostsDto) {
    return this.posts.list(request.auth.workspace.id, query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Req() request: AuthRequest, @Body() dto: CreatePostDto) {
    return this.posts.create(request.auth.workspace.id, dto);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.posts.get(request.auth.workspace.id, id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update(request.auth.workspace.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(
    @Req() request: AuthRequest,
    @Param('id') id: string,
    @Headers('if-match') expectedVersion: string | undefined,
  ) {
    await this.posts.remove(request.auth.workspace.id, id, expectedVersion);
  }
}
