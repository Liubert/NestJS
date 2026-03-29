import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_config')
export class AiConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', default: 'gemini-2.0-flash' })
  model!: string;

  @Column({ name: 'translate_prompt', type: 'text' })
  translatePrompt!: string;

  @Column({ name: 'quality_translate_prompt', type: 'text' })
  qualityTranslatePrompt!: string;

  @Column({ name: 'quality_language_prompt', type: 'text' })
  qualityLanguagePrompt!: string;

  @Column({ name: 'green_min_score', type: 'int', default: 9 })
  greenMinScore!: number;

  @Column({ name: 'yellow_min_score', type: 'int', default: 8 })
  yellowMinScore!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
