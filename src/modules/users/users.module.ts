import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserEntity } from './user.entity';
import { FileRecordEntity } from '../files/file-record.entity';
import { FilesModule } from '../files/files.module';
import { UserResolver } from '../../graphql/user/user.resolver';
import { OrdersModule } from '../orders/orders.module';
import { FileRecordLoader } from '../../graphql/user/file-record.loader';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, FileRecordEntity]),
    FilesModule, // Provides FilesService for UsersService
    OrdersModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UserResolver, FileRecordLoader],
  exports: [UsersService],
})
export class UsersModule {}
