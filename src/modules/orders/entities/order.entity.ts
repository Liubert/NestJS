import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderItemEntity } from './order-item.entity';
import { OrderStatus } from '../../../graphql/orders/order-status.enum';

@Entity('orders')
@Index('UQ_orders_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ type: 'text', default: 'created' })
  status!: OrderStatus;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: '0.00',
    name: 'total_amount',
  })
  totalAmount!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: false })
  items?: OrderItemEntity[];
}
