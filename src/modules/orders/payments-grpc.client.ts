import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  TimeoutError,
  catchError,
  firstValueFrom,
  throwError,
  timeout,
} from 'rxjs';
import { PAYMENTS_GRPC_CLIENT } from './payments-grpc.constants';
import type {
  PaymentsAuthorizeRequest,
  PaymentsAuthorizeResponse,
  PaymentsGrpcApi,
} from './types/payments-contract.types';
import type { AppConfig } from '../../config/app.config';

@Injectable()
export class PaymentsGrpcClient implements OnModuleInit {
  private paymentsApi!: PaymentsGrpcApi;
  private readonly authorizeTimeoutMs: number;

  constructor(
    @Inject(PAYMENTS_GRPC_CLIENT)
    private readonly client: ClientGrpc,
    private readonly configService: ConfigService,
  ) {
    const { payments } = this.configService.getOrThrow<AppConfig>('app');
    this.authorizeTimeoutMs = payments.grpc.timeoutMs;
  }

  onModuleInit(): void {
    // "Payments" must match the service name from payments.proto.
    this.paymentsApi = this.client.getService<PaymentsGrpcApi>('Payments');
  }

  async authorize(
    request: PaymentsAuthorizeRequest,
  ): Promise<PaymentsAuthorizeResponse> {
    return firstValueFrom(
      this.paymentsApi.authorize(request).pipe(
        timeout(this.authorizeTimeoutMs),
        catchError((error: unknown) => {
          if (error instanceof TimeoutError) {
            return throwError(
              () =>
                new GatewayTimeoutException(
                  `Payments.Authorize timed out after ${this.authorizeTimeoutMs}ms`,
                ),
            );
          }

          // Normalize transport/runtime errors from gRPC into stable HTTP-facing error shape.
          return throwError(
            () =>
              new BadGatewayException(
                'Payments service is unavailable or returned an invalid response',
              ),
          );
        }),
      ),
    );
  }
}
