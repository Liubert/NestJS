import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProjectEntity } from './project.entity';

export interface SnapshotEntry {
  namespace: string;
  key: string;
  locale: string;
  value: string | null;
}

@Entity('production_snapshots')
export class ProductionSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProjectEntity, { nullable: false })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'text', nullable: true })
  label!: string | null;

  @Column({ type: 'jsonb' })
  data!: SnapshotEntry[];
}
