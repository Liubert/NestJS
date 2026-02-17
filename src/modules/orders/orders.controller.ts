import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { IdempotencyKey } from '../../common/decorators/IdempotencyKey';
import { UpdateOrderDto } from './dto/update-order.dto';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: { userId: string },
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateOrderDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // const idempotencyKey = crypto.randomUUID();
    const { order, isCreated } = await this.ordersService.create(
      dto,
      idempotencyKey,
      user.userId,
    );
    res.status(isCreated ? 201 : 200);
    return order;
  }

  @Get()
  findAll() {
    return this.ordersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}
