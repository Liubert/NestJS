import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ProjectEntity } from './project.entity';

@Entity('translation_locales')
@Unique(['projectId', 'code'])
export class LocaleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProjectEntity, (p) => p.locales, { nullable: false })
  project!: ProjectEntity;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text' })
  code!: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'text', array: true, default: '{}' })
  aliases!: string[];

  @Column({ type: 'text', nullable: true })
  guidance!: string | null;
}
