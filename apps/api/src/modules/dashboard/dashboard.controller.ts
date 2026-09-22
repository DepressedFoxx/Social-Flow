import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import type { AuthRequest } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@Req() request: AuthRequest) {
    return this.dashboard.get(request.auth.workspace.id);
  }
}
