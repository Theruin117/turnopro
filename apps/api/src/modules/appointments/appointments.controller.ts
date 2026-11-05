import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Appointment, PaginatedResponse } from '@turnopro/contracts';

import { CurrentOrganization } from '../../common/decorators/current-session.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { getRequestMetadata } from '../../common/http/request-metadata';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { AppointmentsService } from './appointments.service';
import { AppointmentsQueryDto } from './dto/appointments-query.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@ApiTags('appointments')
@ApiBearerAuth('access-token')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @RequirePermissions('appointments:read')
  @ApiOperation({ summary: 'Lista los turnos de la organización activa' })
  list(
    @CurrentOrganization() organization: { id: string },
    @Query() query: AppointmentsQueryDto,
  ): Promise<PaginatedResponse<Appointment>> {
    return this.appointments.list(organization.id, query);
  }

  @Get(':id')
  @RequirePermissions('appointments:read')
  @ApiOperation({ summary: 'Obtiene un turno por identificador' })
  @ApiResponse({ status: 404, description: 'El turno no existe en la organización' })
  getById(
    @CurrentOrganization() organization: { id: string },
    @Param('id', new ParseUUIDPipe()) appointmentId: string,
  ): Promise<Appointment> {
    return this.appointments.getById(organization.id, appointmentId);
  }

  @Post()
  @RequirePermissions('appointments:write')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Clave única por organización para reintentos seguros (1-128 caracteres).',
  })
  @ApiOperation({
    summary: 'Crea un turno con protección contra solapamientos e idempotencia',
  })
  @ApiResponse({ status: 201, description: 'Turno creado o reintento idempotente' })
  @ApiResponse({ status: 409, description: 'Horario ocupado o clave reutilizada' })
  create(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<Appointment> {
    return this.appointments.create(
      organization.id,
      request.auth.sub,
      dto,
      idempotencyKey,
      getRequestMetadata(request),
    );
  }

  @Patch(':id/status')
  @HttpCode(200)
  @RequirePermissions('appointments:write')
  @ApiOperation({ summary: 'Cambia el estado operativo de un turno' })
  @ApiResponse({ status: 409, description: 'Transición inválida o turno aún no iniciado' })
  updateStatus(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) appointmentId: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ): Promise<Appointment> {
    return this.appointments.updateStatus(
      organization.id,
      request.auth.sub,
      appointmentId,
      dto,
      getRequestMetadata(request),
    );
  }

  @Patch(':id/schedule')
  @HttpCode(200)
  @RequirePermissions('appointments:write')
  @ApiOperation({
    summary: 'Reprograma un turno conservando sus datos si no se envían',
  })
  @ApiResponse({ status: 409, description: 'Horario ocupado o turno terminal' })
  reschedule(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) appointmentId: string,
    @Body() dto: RescheduleAppointmentDto,
  ): Promise<Appointment> {
    return this.appointments.reschedule(
      organization.id,
      request.auth.sub,
      appointmentId,
      dto,
      getRequestMetadata(request),
    );
  }

  @Patch(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('appointments:write')
  @ApiOperation({ summary: 'Cancela un turno y libera el horario' })
  @ApiResponse({ status: 409, description: 'El turno ya está completado' })
  cancel(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) appointmentId: string,
    @Body() dto: CancelAppointmentDto,
  ): Promise<Appointment> {
    return this.appointments.cancel(
      organization.id,
      request.auth.sub,
      appointmentId,
      dto,
      getRequestMetadata(request),
    );
  }
}
