import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { PaginatedResponse, Service } from '@turnopro/contracts';

import { CurrentOrganization } from '../../common/decorators/current-session.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { getRequestMetadata } from '../../common/http/request-metadata';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import {
  CreateServiceDto,
  ServicesQueryDto,
  UpdateServiceDto,
} from './dto/service.dto';
import { ServicesService } from './services.service';

@ApiTags('services')
@ApiBearerAuth('access-token')
@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @RequirePermissions('services:read')
  @ApiOperation({ summary: 'Lista los servicios de la organización activa' })
  list(
    @CurrentOrganization() organization: { id: string },
    @Query() query: ServicesQueryDto,
  ): Promise<PaginatedResponse<Service>> {
    return this.services.list(organization.id, query);
  }

  @Get(':id')
  @RequirePermissions('services:read')
  @ApiOperation({ summary: 'Obtiene un servicio por identificador' })
  @ApiResponse({ status: 404, description: 'El servicio no existe en la organización' })
  getById(
    @CurrentOrganization() organization: { id: string },
    @Param('id', new ParseUUIDPipe()) serviceId: string,
  ): Promise<Service> {
    return this.services.getById(organization.id, serviceId);
  }

  @Post()
  @RequirePermissions('services:write')
  @ApiOperation({ summary: 'Crea un servicio reservable' })
  create(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateServiceDto,
  ): Promise<Service> {
    return this.services.create(
      organization.id,
      request.auth.sub,
      dto,
      getRequestMetadata(request),
    );
  }

  @Patch(':id')
  @RequirePermissions('services:write')
  @ApiOperation({ summary: 'Actualiza duración, buffers, precio o estado' })
  update(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) serviceId: string,
    @Body() dto: UpdateServiceDto,
  ): Promise<Service> {
    return this.services.update(
      organization.id,
      request.auth.sub,
      serviceId,
      dto,
      getRequestMetadata(request),
    );
  }

  @Delete(':id')
  @RequirePermissions('services:write')
  @ApiOperation({ summary: 'Archiva un servicio sin borrar su historial' })
  archive(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) serviceId: string,
  ): Promise<Service> {
    return this.services.archive(
      organization.id,
      request.auth.sub,
      serviceId,
      getRequestMetadata(request),
    );
  }
}
