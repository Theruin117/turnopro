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
import type { Employee, PaginatedResponse } from '@turnopro/contracts';

import { CurrentOrganization } from '../../common/decorators/current-session.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { getRequestMetadata } from '../../common/http/request-metadata';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request';
import {
  CreateEmployeeDto,
  EmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@ApiBearerAuth('access-token')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('employees:read')
  @ApiOperation({ summary: 'Lista los empleados y sus servicios' })
  list(
    @CurrentOrganization() organization: { id: string },
    @Query() query: EmployeesQueryDto,
  ): Promise<PaginatedResponse<Employee>> {
    return this.employees.list(organization.id, query);
  }

  @Get(':id')
  @RequirePermissions('employees:read')
  @ApiOperation({ summary: 'Obtiene un empleado por identificador' })
  @ApiResponse({ status: 404, description: 'El empleado no existe en la organización' })
  getById(
    @CurrentOrganization() organization: { id: string },
    @Param('id', new ParseUUIDPipe()) employeeId: string,
  ): Promise<Employee> {
    return this.employees.getById(organization.id, employeeId);
  }

  @Post()
  @RequirePermissions('employees:write')
  @ApiOperation({ summary: 'Crea un empleado y asigna servicios' })
  create(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateEmployeeDto,
  ): Promise<Employee> {
    return this.employees.create(
      organization.id,
      request.auth.sub,
      dto,
      getRequestMetadata(request),
    );
  }

  @Patch(':id')
  @RequirePermissions('employees:write')
  @ApiOperation({ summary: 'Actualiza datos, servicios o estado del empleado' })
  update(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ): Promise<Employee> {
    return this.employees.update(
      organization.id,
      request.auth.sub,
      employeeId,
      dto,
      getRequestMetadata(request),
    );
  }

  @Delete(':id')
  @RequirePermissions('employees:write')
  @ApiOperation({ summary: 'Marca al empleado como inactivo' })
  archive(
    @CurrentOrganization() organization: { id: string },
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) employeeId: string,
  ): Promise<Employee> {
    return this.employees.archive(
      organization.id,
      request.auth.sub,
      employeeId,
      getRequestMetadata(request),
    );
  }
}
