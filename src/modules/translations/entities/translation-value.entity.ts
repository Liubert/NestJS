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

@Entity('translation_values')
@Unique(['keyId', 'localeId'])
export class TranslationValueEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => TranslationKeyEntity, (k) => k.values, { nullable: false })
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

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
