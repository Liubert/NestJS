import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProjectEntity } from './project.entity';

@Entity('ai_usage_logs')
@Index('IDX_ai_usage_logs_project_created', ['projectId', 'createdAt'])
export class AiUsageLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'varchar', length: 50 })
  operation!: string;

  @Column({ name: 'input_tokens', type: 'int' })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'int' })
  outputTokens!: number;

  @Column({ name: 'total_tokens', type: 'int' })
  totalTokens!: number;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
