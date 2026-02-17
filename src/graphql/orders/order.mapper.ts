import { OrderEntity } from '../../modules/orders/entities/order.entity';
import { OrderItemEntity } from '../../modules/orders/entities/order-item.entity';
import { OrderItem } from '../orderItems/order-item.model';
import { Order } from './order.model';

export const mapOrderItemEntityToGraphQL = (
  entity: OrderItemEntity,
): OrderItem => {
  return {
    productId: entity.productId,
    quantity: entity.quantity,
    unitPrice: Number(entity.unitPrice), // numeric -> number
    product: undefined, // resolved via @ResolveField + DataLoader
  };
};

export const mapOrderEntityToGraphQL = (entity: OrderEntity): Order => {
  return {
    userId: entity.userId,
    id: entity.id,
    status: entity.status,
    createdAt: entity.createdAt,
    totalAmount: Number(entity.totalAmount), // numeric -> number
    items: entity.items?.map(mapOrderItemEntityToGraphQL) ?? [],
  };
};
