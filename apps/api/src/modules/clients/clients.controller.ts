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
import type { Client, PaginatedResponse } from '@turnopro/contracts';

import { CurrentOrganization } from '../../common/decorators/current-session.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { getRequestMetadata } from '../../common/http/request-metadata';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { ClientsService } from './clients.service';
import {
  ClientsQueryDto,
  CreateClientDto,
  UpdateClientDto,
} from './dto/client.dto';

@ApiTags('clients')
@ApiBearerAuth('access-token')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermissions('clients:read')
  @ApiOperation({ summary: 'Lista los clientes de la organización activa' })
  list(
    @CurrentOrganization() organization: { id: string },
    @Query() query: ClientsQueryDto,
  ): Promise<PaginatedResponse<Client>> {
    return this.clients.list(organization.id, query);
  }

  @Get(':id')
  @RequirePermissions('clients:read')
  @ApiOperation({ summary: 'Obtiene un cliente por identificador' })
  @ApiResponse({ status: 404, description: 'El cliente no existe en la organización' })
  getById(
    @CurrentOrganization() organization: { id: string },
    @Param('id', new ParseUUIDPipe()) clientId: string,
  ): Promise<Client> {
    return this.clients.getById(organization.id, clientId);
  }

  @Post()
  @RequirePermissions('clients:write')
  @ApiOperation({ summary: 'Registra un cliente' })
  create(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateClientDto,
  ): Promise<Client> {
    return this.clients.create(
      organization.id,
      request.auth.sub,
      dto,
      getRequestMetadata(request),
    );
  }

  @Patch(':id')
  @RequirePermissions('clients:write')
  @ApiOperation({ summary: 'Actualiza los datos del cliente' })
  update(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) clientId: string,
    @Body() dto: UpdateClientDto,
  ): Promise<Client> {
    return this.clients.update(
      organization.id,
      request.auth.sub,
      clientId,
      dto,
      getRequestMetadata(request),
    );
  }

  @Delete(':id')
  @RequirePermissions('clients:write')
  @ApiOperation({ summary: 'Archiva un cliente sin borrar su historial' })
  archive(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) clientId: string,
  ): Promise<Client> {
    return this.clients.archive(
      organization.id,
      request.auth.sub,
      clientId,
      getRequestMetadata(request),
    );
  }
}
