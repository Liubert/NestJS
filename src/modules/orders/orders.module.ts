import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { ProcessedMessageEntity } from './entities/processed-message.entity';
import { ProductsModule } from '../products/products.module';
import { OrdersResolver } from '../../graphql/orders/order.resolver';
import { OrderItemResolver } from '../../graphql/orderItems/order-item.resolver';
import { ProductLoader } from '../../graphql/products/product.loader';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      ProcessedMessageEntity,
    ]),
    ProductsModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrdersResolver,
    OrderItemResolver,
    ProductLoader,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
