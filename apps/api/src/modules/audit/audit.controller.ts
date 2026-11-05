import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuditLogEntry, PaginatedResponse } from '@turnopro/contracts';

import { CurrentOrganization } from '../../common/decorators/current-session.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('audit')
@ApiBearerAuth('access-token')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  @ApiOperation({ summary: 'Lista la actividad auditada de la organización activa' })
  @ApiResponse({ status: 403, description: 'Sin permiso audit:read' })
  list(
    @CurrentOrganization() organization: { id: string },
    @Query() query: AuditQueryDto,
  ): Promise<PaginatedResponse<AuditLogEntry>> {
    return this.audit.list(organization.id, query);
  }
}
