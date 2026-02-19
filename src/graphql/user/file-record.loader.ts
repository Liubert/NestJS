import DataLoader from 'dataloader';
import { Injectable, Scope } from '@nestjs/common';

import { FilesService } from '../../modules/files/files.service';
import { FileRecordEntity } from '../../modules/files/file-record.entity';

@Injectable({ scope: Scope.REQUEST })
export class FileRecordLoader {
  constructor(private readonly filesService: FilesService) {}

  // Batch DB fetch: SELECT * FROM file_records WHERE id IN (...)
  public readonly byId = new DataLoader<string, FileRecordEntity | null>(
    async (ids) => {
      // DataLoader can pass duplicates; normalize to reduce DB work
      const uniqueIds = Array.from(new Set(ids));

      const records = await this.filesService.findFileRecordsByIds(uniqueIds);

      const map = new Map<string, FileRecordEntity>();
      for (const r of records) map.set(r.id, r);

      // Keep original order
      return ids.map((id) => map.get(id) ?? null);
    },
  );
}
