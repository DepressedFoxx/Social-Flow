import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaController, MediaUploadController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [AuthModule],
  controllers: [MediaController, MediaUploadController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
