import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/types/request-user';
import { E2eeClaimService } from './e2ee-claim.service';
import { E2eeDevicesService } from './e2ee-devices.service';
import { E2eeEnabledGuard } from './e2ee-enabled.guard';
import { E2eeFlagService } from './e2ee-flag.service';
import { E2eeGroupsService } from './e2ee-groups.service';
import {
  ClaimKeyPackagesDto,
  CreateGroupDto,
  PostCommitDto,
  RegisterDeviceDto,
  UploadKeyPackagesDto,
} from './dto/e2ee.dto';
import { UserThrottlerGuard } from './user-throttler.guard';

@ApiTags('e2ee')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('e2ee')
export class E2eeController {
  constructor(
    private flag: E2eeFlagService,
    private devices: E2eeDevicesService,
    private claims: E2eeClaimService,
    private groups: E2eeGroupsService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Çağıran için uçtan uca şifreleme açık mı (bayrak kapalıyken de cevap verir)',
  })
  status(@CurrentUser() user: RequestUser) {
    return { enabled: this.flag.isEligible(user.id) };
  }

  @Post('devices')
  @UseGuards(E2eeEnabledGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bu oturum zinciri için şifreleme cihazı kaydet (idempotent)' })
  register(@CurrentUser() user: RequestUser, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(user, dto);
  }

  @Get('devices/me')
  @UseGuards(E2eeEnabledGuard)
  @ApiOperation({ summary: 'Kendi cihazımın tüketilmemiş KeyPackage sayısı' })
  available(@CurrentUser() user: RequestUser) {
    return this.devices.available(user);
  }

  @Post('devices/me/key-packages')
  @UseGuards(E2eeEnabledGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'KeyPackage yükle (≤50/çağrı, bekleyen ≤100; lastResort eskisinin yerine geçer)',
  })
  uploadKeyPackages(@CurrentUser() user: RequestUser, @Body() dto: UploadKeyPackagesDto) {
    return this.devices.uploadKeyPackages(user, dto);
  }

  @Get('users/:userId/devices')
  @UseGuards(E2eeEnabledGuard)
  @ApiOperation({ summary: 'Kullanıcının etkin cihazları (yalnız kendisi veya ortak DM)' })
  userDevices(@CurrentUser() user: RequestUser, @Param('userId') userId: string) {
    return this.devices.listUserDevices(user.id, userId);
  }

  @Post('channels/:channelId/key-packages/claim')
  @UseGuards(E2eeEnabledGuard, UserThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hedef cihazlar için KeyPackage tüket (atomik; kullanıcı başı 30/dk)' })
  claim(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: ClaimKeyPackagesDto,
  ) {
    return this.claims.claim(user.id, channelId, dto.deviceIds);
  }

  @Get('channels/:channelId')
  @UseGuards(E2eeEnabledGuard)
  @ApiOperation({
    summary: 'Kanalın şifreli grup durumu + üyelerin tüm cihazları (iptaller dahil)',
  })
  state(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.groups.getState(user.id, channelId);
  }

  @Post('channels/:channelId/group')
  @UseGuards(E2eeEnabledGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'MLS grubunu kur (epoch 0→1); varsa 409 E2EE_GROUP_EXISTS' })
  createGroup(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groups.createGroup(user, channelId, dto);
  }

  @Post('channels/:channelId/commits')
  @UseGuards(E2eeEnabledGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Commit gönder; epoch eşleşmezse 409 E2EE_EPOCH_CONFLICT + currentEpoch',
  })
  postCommit(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: PostCommitDto,
  ) {
    return this.groups.postCommit(user, channelId, dto);
  }

  @Get('channels/:channelId/commits')
  @UseGuards(E2eeEnabledGuard)
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'Bu epoch ve sonrası (varsayılan 0), ≤100',
  })
  @ApiOperation({ summary: 'Commit geçmişi (epoch sırasıyla)' })
  commits(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Query('since') since?: string,
  ) {
    const n = Number.parseInt(since ?? '0', 10);
    return this.groups.listCommits(user.id, channelId, Number.isFinite(n) && n > 0 ? n : 0);
  }

  @Get('welcomes')
  @UseGuards(E2eeEnabledGuard)
  @ApiOperation({ summary: 'Bu cihaza bekleyen Welcome mesajları' })
  welcomes(@CurrentUser() user: RequestUser) {
    return this.groups.listWelcomes(user);
  }

  @Post('welcomes/:id/ack')
  @UseGuards(E2eeEnabledGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Welcome teslim alındı' })
  ack(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.groups.ackWelcome(user, id);
  }
}
