import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NamespaceEntity } from './namespace.entity';
import { LocaleEntity } from './locale.entity';

@Entity('translation_projects')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  slug!: string;

  @Column({ type: 'text' })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => NamespaceEntity, (ns) => ns.project)
  namespaces!: NamespaceEntity[];

  @OneToMany(() => LocaleEntity, (l) => l.project)
  locales!: LocaleEntity[];
}
