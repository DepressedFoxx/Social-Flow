import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PublishingService } from './modules/posts/publishing.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const publishing = app.get(PublishingService);
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      stopping = true;
    });
  while (!stopping) {
    try {
      await publishing.tick();
    } catch (error) {
      console.error('Publishing tick failed', error);
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  await app.close();
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
