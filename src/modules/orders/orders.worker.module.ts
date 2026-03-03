import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { ProcessedMessageEntity } from './entities/processed-message.entity';
import { OrdersWorkerService } from './orders.worker';
import { ProductEntity } from '../products/entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      ProcessedMessageEntity,
      ProductEntity,
    ]),
  ],
  providers: [OrdersService, OrdersWorkerService],
})
export class OrdersWorkerModule {}
