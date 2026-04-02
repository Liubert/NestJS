import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { NamespaceEntity } from './namespace.entity';
import { TranslationValueEntity } from './translation-value.entity';

@Entity('translation_keys')
@Unique(['namespaceId', 'key'])
export class TranslationKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => NamespaceEntity, (ns) => ns.keys, { nullable: false })
  namespace!: NamespaceEntity;

  @Column({ name: 'namespace_id', type: 'uuid' })
  namespaceId!: string;

  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  context!: string | null;

  @Column({
    name: 'context_need',
    type: 'varchar',
    length: 10,
    nullable: true,
    default: null,
  })
  contextNeed!: 'required' | 'useful' | 'none' | null;

  @Column({
    name: 'context_reason',
    type: 'varchar',
    length: 300,
    nullable: true,
    default: null,
  })
  contextReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => TranslationValueEntity, (v) => v.translationKey)
  values!: TranslationValueEntity[];
}
