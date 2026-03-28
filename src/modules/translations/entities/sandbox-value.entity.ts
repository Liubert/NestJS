import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TranslationKeyEntity } from './translation-key.entity';
import { LocaleEntity } from './locale.entity';
import { ProjectEntity } from './project.entity';

@Entity('sandbox_values')
@Unique(['projectId', 'keyId', 'localeId'])
export class SandboxValueEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProjectEntity, { nullable: false })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => TranslationKeyEntity, { nullable: false })
  @JoinColumn({ name: 'key_id' })
  translationKey!: TranslationKeyEntity;

  @Column({ name: 'key_id', type: 'uuid' })
  keyId!: string;

  @ManyToOne(() => LocaleEntity, { nullable: false })
  @JoinColumn({ name: 'locale_id' })
  locale!: LocaleEntity;

  @Column({ name: 'locale_id', type: 'uuid' })
  localeId!: string;

  @Column({ type: 'text', nullable: true })
  value!: string | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
