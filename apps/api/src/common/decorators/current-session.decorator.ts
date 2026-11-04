import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../types/authenticated-request';

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return {
      auth: request.auth,
      user: request.user,
      membership: request.membership,
      organization: request.organization,
    };
  },
);

export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.organization;
  },
);
