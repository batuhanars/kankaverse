import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SessionSweepJob } from './session-sweep.job';
import { SharedModule } from '../../shared/shared.module';
import { E2eeModule } from '../e2ee/e2ee.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), SharedModule, E2eeModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SessionSweepJob],
  exports: [AuthService], // E5a: yedek sıfırla/sil aynı reauth'u (verifyReauth) kullanır
})
export class AuthModule {}
