import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleProvider } from './google.provider';
import { SessionGuard } from './session.guard';
import { AuthRateGuard } from './auth-rate.guard';
import { ChannelsController } from './channels.controller';

@Module({
  controllers: [AuthController, ChannelsController],
  providers: [AuthService, GoogleProvider, SessionGuard, AuthRateGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
