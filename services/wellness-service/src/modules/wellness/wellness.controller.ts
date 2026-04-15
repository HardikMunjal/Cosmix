import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CoachRequestDto } from './dto/coach-request.dto';
import { WellnessService } from './wellness.service';
import { WellnessStorageService } from './wellness-storage.service';
import { StravaService } from './strava.service';

@Controller('wellness')
export class WellnessController {
  constructor(
    private readonly wellnessService: WellnessService,
    private readonly storageService: WellnessStorageService,
    private readonly stravaService: StravaService,
  ) {}

  @Get('defaults')
  getDefaults() {
    return this.wellnessService.getDefaults();
  }

  @Post('coach')
  coach(@Body() coachRequest: CoachRequestDto) {
    return this.wellnessService.buildCoachResponse(coachRequest);
  }

  @Get('data/:userId')
  loadUserData(@Param('userId') userId: string) {
    return this.storageService.load(userId);
  }

  @Put('data/:userId')
  saveUserData(@Param('userId') userId: string, @Body() body: { entries: any[]; form: any }) {
    this.storageService.save(userId, body);
    return { ok: true };
  }

  /* ---- Strava integration ---- */

  @Get('strava/auth-url')
  stravaAuthUrl(@Query('userId') userId: string, @Query('redirectUri') redirectUri: string) {
    // Redirect URI should point to the SERVER callback, not the frontend
    const serverCallback = redirectUri.replace(/:\d+\/.*$/, ':3004/wellness/strava/callback');
    const url = this.stravaService.getAuthUrl(userId, serverCallback);
    return { url, configured: !!url };
  }

  @Get('strava/callback')
  async stravaCallbackGet(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    // state = userId from auth URL
    const userId = state || 'default';
    console.log(`Strava callback: code=${code?.slice(0, 8)}..., userId=${userId}`);
    const ok = await this.stravaService.exchangeCode(code, userId);
    console.log(`Strava token exchange: ${ok ? 'SUCCESS' : 'FAILED'}`);
    // Redirect back to frontend wellness page with result
    const frontendUrl = `http://192.168.1.5:3005/wellness?strava=${ok ? 'ok' : 'fail'}`;
    return res.redirect(frontendUrl);
  }

  @Post('strava/callback')
  async stravaCallback(@Body() body: { code: string; userId: string }) {
    const ok = await this.stravaService.exchangeCode(body.code, body.userId);
    return { ok };
  }

  @Get('strava/status/:userId')
  stravaStatus(@Param('userId') userId: string) {
    return { connected: this.stravaService.isConnected(userId) };
  }

  @Get('strava/activities/:userId')
  async stravaActivities(@Param('userId') userId: string) {
    const activities = await this.stravaService.getTodayActivities(userId);
    const fields = this.stravaService.mapToWellnessFields(activities);
    return { activities: activities.length, fields };
  }

  @Delete('strava/:userId')
  stravaDisconnect(@Param('userId') userId: string) {
    this.stravaService.disconnect(userId);
    return { ok: true };
  }
}