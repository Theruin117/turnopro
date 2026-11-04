import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import type { HealthReport } from '@turnopro/shared';

import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe: el proceso HTTP está vivo' })
  @ApiResponse({ status: 200, description: 'Servicio vivo' })
  live(): HealthReport {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe: PostgreSQL y Redis disponibles' })
  @ApiResponse({ status: 200, description: 'Todas las dependencias están disponibles' })
  @ApiResponse({ status: 503, description: 'Alguna dependencia no está disponible' })
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.health.readiness();
    response.status(
      report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return report;
  }
}
