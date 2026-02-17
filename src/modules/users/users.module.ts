import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './user.entity';
import { UserResolver } from '../../graphql/user/user.resolver';
import { OrdersModule } from '../orders/orders.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    // Registers repository UserEntity inside this module DI container
    TypeOrmModule.forFeature([UserEntity]),
    OrdersModule,
    FilesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UserResolver],
  exports: [UsersService],
})
export class UsersModule {}
