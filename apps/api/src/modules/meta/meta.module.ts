import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MetaCrypto } from './meta.crypto';
import { MetaGraph } from './meta.graph';
import { MetaService } from './meta.service';
import { MetaController } from './meta.controller';
@Module({
  imports: [AuthModule],
  providers: [MetaCrypto, MetaGraph, MetaService],
  controllers: [MetaController],
  exports: [MetaCrypto, MetaGraph],
})
export class MetaModule {}
