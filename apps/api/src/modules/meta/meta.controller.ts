import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';
import type { Response } from 'express';
import { SessionGuard } from '../auth/session.guard';
import type { AuthRequest } from '../auth/auth.types';
import { MetaService } from './meta.service';
import { MetaGraph } from './meta.graph';

class ConnectAccountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keys!: string[];
}
@Controller('connections/meta')
@UseGuards(SessionGuard)
export class MetaController {
  constructor(
    private readonly meta: MetaService,
    private readonly graph: MetaGraph,
    private readonly config: ConfigService,
  ) {}
  @Get('status')
  @Header('Cache-Control', 'no-store')
  status() {
    return {
      configured: this.graph.ready,
      mediaConfigured: Boolean(this.config.get<string>('META_PUBLIC_API_ORIGIN')),
      provider: 'META',
    };
  }
  @Post('start')
  start(@Req() request: AuthRequest) {
    return this.meta.begin(request);
  }
  @Get('callback')
  async callback(
    @Req() request: AuthRequest,
    @Query('state') state: string,
    @Query('code') code: string | undefined,
    @Res() response: Response,
  ) {
    let result = 'choose';
    try {
      await this.meta.callback(
        request,
        typeof state === 'string' ? state : '',
        typeof code === 'string' ? code : undefined,
      );
      if (!code) result = 'cancelled';
    } catch {
      result = 'failed';
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.redirect(
      this.config.getOrThrow<string>('WEB_ORIGIN') + '/accounts?meta=' + result,
    );
  }
  @Get('pending')
  @Header('Cache-Control', 'no-store')
  pending(@Req() request: AuthRequest) {
    return this.meta.pending(request);
  }
  @Post('connect')
  connect(@Req() request: AuthRequest, @Body() dto: ConnectAccountsDto) {
    return this.meta.connect(request, dto.keys);
  }
  @Delete(':id')
  async disconnect(@Req() request: AuthRequest, @Param('id') id: string) {
    await this.meta.disconnect(request.auth.workspace.id, id);
    return { disconnected: true };
  }
}
