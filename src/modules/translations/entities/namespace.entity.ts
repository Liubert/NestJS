import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ProjectEntity } from './project.entity';
import { TranslationKeyEntity } from './translation-key.entity';

@Entity('translation_namespaces')
@Unique(['projectId', 'slug'])
export class NamespaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProjectEntity, (p) => p.namespaces, { nullable: false })
  project!: ProjectEntity;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text' })
  slug!: string;

  @Column({ name: 'original_file', type: 'text', nullable: true })
  originalFile!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => TranslationKeyEntity, (k) => k.namespace)
  keys!: TranslationKeyEntity[];
}
