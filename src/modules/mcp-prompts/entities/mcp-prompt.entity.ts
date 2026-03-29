import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('mcp_prompts')
export class McpPromptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'prompt_key', type: 'varchar', length: 100 })
  promptKey!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
