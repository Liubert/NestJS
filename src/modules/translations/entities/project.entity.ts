import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { NamespaceEntity } from './namespace.entity.js';
import { LocaleEntity } from './locale.entity.js';
import { ProjectMemberEntity } from './project-member.entity.js';

@Entity('translation_projects')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  slug!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  ownerId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({
    name: 'sandbox_initialized_at',
    type: 'timestamptz',
    nullable: true,
  })
  sandboxInitializedAt!: Date | null;

  @Column({ name: 'sandbox_has_changes', type: 'boolean', default: false })
  sandboxHasChanges!: boolean;

  @OneToMany(() => NamespaceEntity, (ns) => ns.project)
  namespaces!: NamespaceEntity[];

  @OneToMany(() => LocaleEntity, (l) => l.project)
  locales!: LocaleEntity[];

  @OneToMany(() => ProjectMemberEntity, (m) => m.project)
  members!: ProjectMemberEntity[];
}
