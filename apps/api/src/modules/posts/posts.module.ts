import { MetaModule } from '../meta/meta.module';
import { MetaPublisher } from './meta.publisher';
import { PublishingMediaController } from './publishing-media.controller';
import { CalendarController } from './calendar.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { PostsController } from './posts.controller';
import { PublishingService } from './publishing.service';
import { PostsService } from './posts.service';

@Module({
  imports: [AuthModule, MediaModule, MetaModule],
  controllers: [PostsController, CalendarController, PublishingMediaController],
  providers: [PostsService, PublishingService, MetaPublisher],
})
export class PostsModule {}
