import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';
import { PartyImportController } from './party-import.controller';
import { PartyImportService } from './party-import.service';

@Module({
  imports: [AuditModule, FilesModule],
  controllers: [PartyImportController],
  providers: [PartyImportService],
})
export class PartyImportModule {}
