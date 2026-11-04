import { Body, Controller, Get, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Organization } from '@turnopro/database';
import type {
  AuthOrganization,
  MembershipListItem,
  PaginatedResponse,
} from '@turnopro/contracts';

import { CurrentOrganization } from '../../common/decorators/current-session.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { getRequestMetadata } from '../../common/http/request-metadata';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { MembersQueryDto } from './dto/members-query.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth('access-token')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('current')
  @RequirePermissions('organization:read')
  @ApiOperation({ summary: 'Obtiene la organización activa del token' })
  current(
    @CurrentOrganization() organization: Organization,
  ): Promise<AuthOrganization> {
    return this.organizations.getCurrent(organization.id);
  }

  @Patch('current')
  @RequirePermissions('organization:update')
  @ApiOperation({ summary: 'Actualiza nombre, zona horaria o moneda' })
  @ApiResponse({ status: 200, description: 'Organización actualizada' })
  update(
    @CurrentOrganization() organization: Organization,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<AuthOrganization> {
    return this.organizations.update(
      organization.id,
      request.auth.sub,
      dto,
      getRequestMetadata(request),
    );
  }

  @Get('current/members')
  @RequirePermissions('members:read')
  @ApiOperation({ summary: 'Lista las membresías de la organización activa' })
  members(
    @CurrentOrganization() organization: Organization,
    @Query() query: MembersQueryDto,
  ): Promise<PaginatedResponse<MembershipListItem>> {
    return this.organizations.listMembers(organization.id, query);
  }
}
