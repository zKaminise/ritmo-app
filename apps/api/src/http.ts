import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  PipeTransform,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
export type AuthRequest = Request & { userId: string };
export class SchemaPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        message: result.error.issues[0]?.message ?? 'Confira os dados informados.',
        fields: result.error.flatten(),
      });
    return result.data;
  }
}
@Catch()
export class Errors implements ExceptionFilter {
  private readonly logger = new Logger('API');
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const detail = error instanceof HttpException ? error.getResponse() : undefined;
    if (status >= 500) this.logger.error(error instanceof Error ? error.stack : String(error));
    const message =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'message' in detail
          ? detail.message
          : 'Não conseguimos completar esta ação. Tente novamente.';
    res.status(status).json({
      message,
      ...(detail && typeof detail === 'object' && 'fields' in detail
        ? { fields: detail.fields }
        : {}),
    });
  }
}
