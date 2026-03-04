import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
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
import type { RequestWithMetadata } from '../../common/middleware/logger.middleware';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: { userId: string },
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateOrderDto,
    @Req() req: RequestWithMetadata,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Producer endpoint:
    // 1) persist order intent as PENDING in DB
    // 2) publish "process order" message to RabbitMQ
    // 3) return HTTP response immediately (no heavy sync processing here)

    const { order, isCreated } = await this.ordersService.create(
      dto,
      idempotencyKey,
      user.userId,
      req.correlationId,
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

  // -------------------- TEST ENDPOINTS --------------------

  @Post('test/rabbit/success')
  async testRabbitSuccess(@Req() req: RequestWithMetadata) {
    await this.ordersService.testPublishRabbit('ok-order', req.correlationId);
    return { status: 'sent', mode: 'success' };
  }

  @Post('test/rabbit/fail')
  async testRabbitFail(@Req() req: RequestWithMetadata) {
    // Worker will treat IDs starting with "fail-" as forced failure
    await this.ordersService.testPublishRabbit(
      `fail-${Date.now()}`,
      req.correlationId,
    );
    return { status: 'sent', mode: 'fail' };
  }
}
