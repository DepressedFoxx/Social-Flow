import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  @ApiOperation({ summary: 'API liveness; does not check the database' })
  live() {
    return {
      status: 'ok',
      service: 'social-flow-api',
      timestamp: new Date().toISOString(),
    };
  }
  @Get('ready')
  @ApiOperation({ summary: 'Readiness; runs SELECT 1 against PostgreSQL' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unavailable' });
    }
  }
}
