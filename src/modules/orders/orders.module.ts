import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { ProcessedMessageEntity } from './entities/processed-message.entity';
import { ProductsModule } from '../products/products.module';
import { OrdersResolver } from '../../graphql/orders/order.resolver';
import { OrderItemResolver } from '../../graphql/orderItems/order-item.resolver';
import { ProductLoader } from '../../graphql/products/product.loader';
import { AppConfig } from '../../config/app.config';
import { join } from 'path';
import { PAYMENTS_GRPC_CLIENT } from './payments-grpc.constants';
import { PaymentsGrpcClient } from './payments-grpc.client';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: PAYMENTS_GRPC_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const { payments } = configService.getOrThrow<AppConfig>('app');

          return {
            transport: Transport.GRPC,
            options: {
              url: payments.grpc.url,
              package: payments.grpc.packageName,
              protoPath: join(process.cwd(), payments.grpc.protoPath),
            },
          };
        },
      },
    ]),
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
    PaymentsGrpcClient,
    OrdersResolver,
    OrderItemResolver,
    ProductLoader,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
