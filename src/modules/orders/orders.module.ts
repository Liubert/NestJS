import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { ProductsModule } from '../products/products.module';
import { OrdersResolver } from '../../graphql/orders/order.resolver';
import { OrderItemResolver } from '../../graphql/orderItems/order-item.resolver';
import { ProductLoader } from '../../graphql/products/product.loader';
import { OrdersWorkerService } from './orders.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, OrderItemEntity]),
    ProductsModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrdersResolver,
    OrderItemResolver,
    ProductLoader,
    OrdersWorkerService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
