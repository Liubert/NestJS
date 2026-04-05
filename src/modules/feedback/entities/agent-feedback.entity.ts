import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../../users/user.entity.js';
import { ProjectEntity } from '../../translations/entities/project.entity.js';

@Entity('agent_feedback')
export class AgentFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  projectId!: string | null;

  @Column({ type: 'boolean', name: 'is_mcp_token', default: false })
  isMcpToken!: boolean;

  @Column({ type: 'varchar', length: 30 })
  category!: string;

  @Column({
    type: 'varchar',
    length: 200,
    name: 'tool_or_endpoint',
    nullable: true,
  })
  toolOrEndpoint!: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'action_attempted',
    nullable: true,
  })
  actionAttempted!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'result_status',
    nullable: true,
  })
  resultStatus!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'medium' })
  severity!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'text', nullable: true })
  suggestion!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'agent_name', nullable: true })
  agentName!: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'agent_version',
    nullable: true,
  })
  agentVersion!: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'agent_model',
    nullable: true,
  })
  agentModel!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'session_id', nullable: true })
  sessionId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'boolean', default: false })
  reviewed!: boolean;

  @Column({ type: 'text', name: 'reviewer_note', nullable: true })
  reviewerNote!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => ProjectEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity | null;
}
