import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { delay, of, throwError } from 'rxjs';
import { PaymentsGrpcClient } from './payments-grpc.client';

function createConfigService(timeoutMs: number): ConfigService {
  return {
    getOrThrow: jest.fn().mockReturnValue({
      payments: {
        grpc: {
          timeoutMs,
        },
      },
    }),
  } as unknown as ConfigService;
}

function createGrpcClient(authorizeImpl: () => unknown): ClientGrpc {
  return {
    getService: jest.fn().mockReturnValue({
      authorize: authorizeImpl,
    }),
  } as unknown as ClientGrpc;
}

describe('PaymentsGrpcClient', () => {
  it('maps slow authorize response to GatewayTimeoutException', async () => {
    const grpcClient = createGrpcClient(() =>
      of({ paymentId: 'p1', status: 'AUTHORIZED' }).pipe(delay(30)),
    );
    const configService = createConfigService(5);
    const client = new PaymentsGrpcClient(grpcClient, configService);

    client.onModuleInit();

    await expect(
      client.authorize({
        orderId: 'order-1',
        amount: '1000',
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  it('maps transport errors to BadGatewayException', async () => {
    const grpcClient = createGrpcClient(() =>
      throwError(() => new Error('grpc unavailable')),
    );
    const configService = createConfigService(1000);
    const client = new PaymentsGrpcClient(grpcClient, configService);

    client.onModuleInit();

    await expect(
      client.authorize({
        orderId: 'order-2',
        amount: '1000',
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('returns authorize response before timeout', async () => {
    const grpcClient = createGrpcClient(() =>
      of({ paymentId: 'p2', status: 'AUTHORIZED' }).pipe(delay(5)),
    );
    const configService = createConfigService(100);
    const client = new PaymentsGrpcClient(grpcClient, configService);

    client.onModuleInit();

    await expect(
      client.authorize({
        orderId: 'order-3',
        amount: '1000',
        currency: 'USD',
      }),
    ).resolves.toEqual({
      paymentId: 'p2',
      status: 'AUTHORIZED',
    });
  });
});
