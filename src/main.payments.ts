import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/app.config';
import { PaymentsAppModule } from './payments-app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrapPayments() {
  const grpcPackage = process.env.PAYMENTS_GRPC_PACKAGE ?? 'payments';
  const grpcBindUrl = process.env.PAYMENTS_GRPC_BIND_URL ?? '0.0.0.0:50051';
  const protoPath = join(
    process.cwd(),
    process.env.PAYMENTS_GRPC_PROTO_PATH ?? 'proto/payments.proto',
  );

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PaymentsAppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: grpcPackage,
        url: grpcBindUrl,
        protoPath,
      },
    },
  );

  const configService = app.get(ConfigService);
  const { payments, env } = configService.getOrThrow<AppConfig>('app');

  // The gRPC server runs as its own process and listens on configured bind address.
  await app.listen();

  console.log(`Payments environment is: ${env}`);
  console.log(`Payments gRPC package is: ${payments.grpc.packageName}`);
  console.log(`Payments gRPC bind target is: ${payments.grpc.bindUrl}`);
  console.log(`Payments proto path is: ${payments.grpc.protoPath}`);
}

void bootstrapPayments().catch((err) => {
  console.error('Payments bootstrap failed:', err);
  process.exit(1);
});
