import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { FileVisibility } from './dto/presign.dto';

export enum FileStatus {
  PENDING = 'pending',
  READY = 'ready',
}

@Entity('file_records')
@Index(['ownerId'])
@Index(['entityId'])
export class FileRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId!: string;

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId!: string;

  @Column()
  key!: string;

  @Column({ name: 'content_type' })
  contentType!: string;

  @Column({ type: 'int', nullable: true })
  size!: number | null;

  @Column({ type: 'varchar' })
  status!: FileStatus;

  @Column({ type: 'varchar' })
  visibility!: FileVisibility;
}
