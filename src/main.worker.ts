import { NestFactory } from '@nestjs/core';
import { WorkerAppModule } from './worker-app.module';

async function bootstrapWorker() {
  await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ['log', 'warn', 'error'],
  });
}

void bootstrapWorker().catch((err) => {
  console.error('Worker bootstrap failed:', err);
  process.exit(1);
});
