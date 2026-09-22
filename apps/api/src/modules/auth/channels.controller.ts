import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionGuard } from './session.guard';
import type { AuthRequest } from './auth.types';

@ApiTags('channels')
@Controller('channels')
@UseGuards(SessionGuard)
export class ChannelsController {
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthRequest) {
    return request.auth.workspace.channels;
  }
}
