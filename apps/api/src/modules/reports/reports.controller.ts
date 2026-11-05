import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ReportsSummary } from '@turnopro/contracts';

import { CurrentOrganization } from '../../common/decorators/current-session.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ReportsSummaryQueryDto } from './dto/reports-summary-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Resumen operativo de la organización activa' })
  @ApiResponse({ status: 400, description: 'Rango inválido o mayor a 366 días' })
  @ApiResponse({ status: 403, description: 'Sin permiso reports:read' })
  summary(
    @CurrentOrganization() organization: { id: string },
    @Query() query: ReportsSummaryQueryDto,
  ): Promise<ReportsSummary> {
    return this.reports.summary(organization.id, query);
  }
}
