import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';

/**
 * Global module — AuditLogService is available everywhere without explicit imports.
 * Registered once in AppModule.
 */
@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
