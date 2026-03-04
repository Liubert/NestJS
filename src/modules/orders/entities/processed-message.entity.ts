import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('processed_messages')
@Index('UQ_processed_messages_message_id', ['messageId'], { unique: true })
export class ProcessedMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'message_id' })
  messageId!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @Column({ type: 'text', nullable: true })
  handler!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'processed_at' })
  processedAt!: Date;
}
