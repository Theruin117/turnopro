import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  AvailabilityRule,
  AvailabilitySlotsResponse,
  TimeOff,
} from '@turnopro/contracts';

import { CurrentOrganization } from '../../common/decorators/current-session.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { getRequestMetadata } from '../../common/http/request-metadata';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { AvailabilityService } from './availability.service';
import {
  AvailabilitySlotsQueryDto,
  CreateTimeOffDto,
  ReplaceAvailabilityRulesDto,
  TimeOffQueryDto,
} from './dto/availability.dto';

@ApiTags('availability')
@ApiBearerAuth('access-token')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('slots')
  @RequirePermissions('appointments:read')
  @ApiOperation({
    summary: 'Calcula horarios disponibles para un empleado, servicio y fecha',
  })
  getSlots(
    @CurrentOrganization() organization: { id: string },
    @Query() query: AvailabilitySlotsQueryDto,
  ): Promise<AvailabilitySlotsResponse> {
    return this.availability.getSlots(organization.id, query);
  }

  @Get('employees/:employeeId/rules')
  @RequirePermissions('employees:read')
  @ApiOperation({ summary: 'Lista el horario semanal del empleado' })
  listRules(
    @CurrentOrganization() organization: { id: string },
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ): Promise<AvailabilityRule[]> {
    return this.availability.listRules(organization.id, employeeId);
  }

  @Put('employees/:employeeId/rules')
  @RequirePermissions('employees:write')
  @ApiOperation({ summary: 'Reemplaza el horario semanal del empleado' })
  replaceRules(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: ReplaceAvailabilityRulesDto,
  ): Promise<AvailabilityRule[]> {
    return this.availability.replaceRules(
      organization.id,
      request.auth.sub,
      employeeId,
      dto,
      getRequestMetadata(request),
    );
  }

  @Get('employees/:employeeId/time-off')
  @RequirePermissions('employees:read')
  @ApiOperation({ summary: 'Lista los bloqueos puntuales del empleado' })
  listTimeOff(
    @CurrentOrganization() organization: { id: string },
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Query() query: TimeOffQueryDto,
  ): Promise<TimeOff[]> {
    return this.availability.listTimeOff(organization.id, employeeId, query);
  }

  @Post('employees/:employeeId/time-off')
  @RequirePermissions('employees:write')
  @ApiOperation({ summary: 'Crea un bloqueo puntual de disponibilidad' })
  createTimeOff(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateTimeOffDto,
  ): Promise<TimeOff> {
    return this.availability.createTimeOff(
      organization.id,
      request.auth.sub,
      employeeId,
      dto,
      getRequestMetadata(request),
    );
  }

  @Delete('time-off/:id')
  @HttpCode(204)
  @RequirePermissions('employees:write')
  @ApiOperation({ summary: 'Elimina un bloqueo puntual' })
  @ApiResponse({ status: 404, description: 'El bloqueo no existe en la organización' })
  async deleteTimeOff(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) timeOffId: string,
  ): Promise<void> {
    await this.availability.deleteTimeOff(
      organization.id,
      request.auth.sub,
      timeOffId,
      getRequestMetadata(request),
    );
  }
}
