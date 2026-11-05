import { Injectable } from '@nestjs/common';
import { type Prisma } from '@turnopro/database';
import type {
  Employee,
  EmployeeStatus,
  PaginatedResponse,
} from '@turnopro/contracts';
import { AppError, ErrorCode, type RequestMetadata } from '@turnopro/shared';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  CreateEmployeeDto,
  EmployeesQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';

const employeeInclude = {
  employeeServices: {
    include: {
      service: {
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          priceCents: true,
          status: true,
        },
      },
    },
    orderBy: { service: { name: 'asc' } },
  },
} satisfies Prisma.EmployeeInclude;

type EmployeeWithServices = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    organizationId: string,
    query: EmployeesQueryDto,
  ): Promise<PaginatedResponse<Employee>> {
    const { page, pageSize } = query;
    const where: Prisma.EmployeeWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, employees] = await this.prisma.$transaction([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: employees.map(mapEmployee),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getById(organizationId: string, employeeId: string): Promise<Employee> {
    const employee = await this.findOrThrow(organizationId, employeeId);
    return mapEmployee(employee);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateEmployeeDto,
    meta: RequestMetadata,
  ): Promise<Employee> {
    const serviceIds = dto.serviceIds ?? [];
    await this.assertServicesBelongToOrganization(organizationId, serviceIds);

    const employee = await this.prisma.employee.create({
      data: {
        organizationId,
        name: dto.name,
        email: dto.email || null,
        phone: dto.phone || null,
        color: dto.color || null,
        ...(serviceIds.length > 0
          ? {
              employeeServices: {
                createMany: {
                  data: serviceIds.map((serviceId) => ({
                    organizationId,
                    serviceId,
                  })),
                },
              },
            }
          : {}),
      },
      include: employeeInclude,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'employee.created',
      entity: 'employee',
      entityId: employee.id,
      metadata: { name: employee.name, serviceIds },
      ...meta,
    });

    return mapEmployee(employee);
  }

  async update(
    organizationId: string,
    actorUserId: string,
    employeeId: string,
    dto: UpdateEmployeeDto,
    meta: RequestMetadata,
  ): Promise<Employee> {
    await this.findOrThrow(organizationId, employeeId);

    if (Object.keys(dto).length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        'Envía al menos un campo para actualizar',
      );
    }

    const serviceIds = dto.serviceIds;
    if (serviceIds) {
      await this.assertServicesBelongToOrganization(organizationId, serviceIds);
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      if (serviceIds) {
        await tx.employeeService.deleteMany({
          where: { organizationId, employeeId },
        });

        if (serviceIds.length > 0) {
          await tx.employeeService.createMany({
            data: serviceIds.map((serviceId) => ({
              organizationId,
              employeeId,
              serviceId,
            })),
          });
        }
      }

      return tx.employee.update({
        where: { id: employeeId },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.email === undefined ? {} : { email: dto.email || null }),
          ...(dto.phone === undefined ? {} : { phone: dto.phone || null }),
          ...(dto.color === undefined ? {} : { color: dto.color || null }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
        },
        include: employeeInclude,
      });
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'employee.updated',
      entity: 'employee',
      entityId: employee.id,
      metadata: { fields: Object.keys(dto) },
      ...meta,
    });

    return mapEmployee(employee);
  }

  async archive(
    organizationId: string,
    actorUserId: string,
    employeeId: string,
    meta: RequestMetadata,
  ): Promise<Employee> {
    const existing = await this.findOrThrow(organizationId, employeeId);

    if (existing.status === 'INACTIVE') {
      return mapEmployee(existing);
    }

    const employee = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { status: 'INACTIVE' },
      include: employeeInclude,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'employee.archived',
      entity: 'employee',
      entityId: employee.id,
      ...meta,
    });

    return mapEmployee(employee);
  }

  private async findOrThrow(
    organizationId: string,
    employeeId: string,
  ): Promise<EmployeeWithServices> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      include: employeeInclude,
    });

    if (!employee) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'El empleado no existe en esta organización',
      );
    }

    return employee;
  }

  private async assertServicesBelongToOrganization(
    organizationId: string,
    serviceIds: string[],
  ): Promise<void> {
    if (serviceIds.length === 0) {
      return;
    }

    const count = await this.prisma.service.count({
      where: { organizationId, id: { in: serviceIds } },
    });

    if (count !== serviceIds.length) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        'Uno o más servicios no existen en esta organización',
        { field: 'serviceIds' },
      );
    }
  }
}

function mapEmployee(employee: EmployeeWithServices): Employee {
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    color: employee.color,
    status: employee.status as EmployeeStatus,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
    services: employee.employeeServices.map(({ service }) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      status: service.status,
    })),
  };
}
