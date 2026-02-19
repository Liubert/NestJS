import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FileVisibility } from './dto/presign.dto';

export enum FileStatus {
  PENDING = 'pending',
  READY = 'ready',
}

@Entity('file_records')
@Index('IDX_file_records_owner_id', ['ownerId'])
@Index('IDX_file_records_entity_id', ['entityId'])
@Index('UQ_file_records_key', ['key'], { unique: true })
export class FileRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId!: string;

  @Column({ type: 'uuid', name: 'entity_id', nullable: true })
  entityId!: string | null;

  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'text', name: 'content_type' })
  contentType!: string;

  @Column({ type: 'int', default: 0 })
  size!: number;

  @Column({ type: 'text', default: FileStatus.PENDING })
  status!: FileStatus;

  @Column({ type: 'text', default: FileVisibility.PRIVATE })
  visibility!: FileVisibility;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
