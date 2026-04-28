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
  async getDefaults() {
    return {
      ...this.wellnessService.getDefaults(),
      scoringRules: await this.storageService.loadScoringRules(),
    };
  }

  @Post('coach')
  coach(@Body() coachRequest: CoachRequestDto) {
    return this.wellnessService.buildCoachResponse(coachRequest);
  }

  @Get('data/:userId')
  async loadUserData(@Param('userId') userId: string) {
    const [state, scoringRules] = await Promise.all([
      this.storageService.load(userId),
      this.storageService.loadScoringRules(),
    ]);
    return { ...state, scoringRules };
  }

  @Put('data/:userId')
  async saveUserData(@Param('userId') userId: string, @Body() body: { entries: any[]; form: any }) {
    const [state, scoringRules] = await Promise.all([
      this.storageService.save(userId, body),
      this.storageService.loadScoringRules(),
    ]);
    return { ...state, scoringRules };
  }

  @Delete('data/:userId')
  async clearUserData(@Param('userId') userId: string) {
    const [state, scoringRules] = await Promise.all([
      this.storageService.clear(userId),
      this.storageService.loadScoringRules(),
    ]);
    return { ...state, scoringRules };
  }

  @Post('plan/:userId')
  async startPlan(
    @Param('userId') userId: string,
    @Body() body: { startDate: string; name?: string },
  ) {
    const [state, scoringRules] = await Promise.all([
      this.storageService.startPlan(userId, body.startDate, body.name),
      this.storageService.loadScoringRules(),
    ]);
    return { ...state, scoringRules };
  }

  @Put('plan/:userId/name')
  async renamePlan(
    @Param('userId') userId: string,
    @Body() body: { name: string },
  ) {
    const [state, scoringRules] = await Promise.all([
      this.storageService.renamePlan(userId, body.name),
      this.storageService.loadScoringRules(),
    ]);
    return { ...state, scoringRules };
  }

  @Post('plan/:userId/reset')
  async resetCurrentPlan(@Param('userId') userId: string) {
    const [state, scoringRules] = await Promise.all([
      this.storageService.resetCurrentPlan(userId),
      this.storageService.loadScoringRules(),
    ]);
    return { ...state, scoringRules };
  }

  @Post('plan/:userId/close')
  async closePlan(@Param('userId') userId: string) {
    const [state, scoringRules] = await Promise.all([
      this.storageService.closePlan(userId),
      this.storageService.loadScoringRules(),
    ]);
    return { ...state, scoringRules };
  }

  @Get('plan/:userId/:planId')
  async getPlanDetails(
    @Param('userId') userId: string,
    @Param('planId') planId: string,
  ) {
    return this.storageService.loadPlanDetails(userId, planId);
  }

  @Get('scoring-rules')
  getScoringRules() {
    return this.storageService.loadScoringRules();
  }

  @Put('scoring-rules')
  updateScoringRules(@Body() body: any) {
    return this.storageService.saveScoringRules(body || {});
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
  async stravaStatus(@Param('userId') userId: string) {
    return { connected: await this.stravaService.isConnected(userId) };
  }

  @Get('strava/activities/:userId')
  async stravaActivities(@Param('userId') userId: string) {
    const activities = await this.stravaService.getTodayActivities(userId);
    const fields = this.stravaService.mapToWellnessFields(activities);
    return { activities: activities.length, fields };
  }

  @Delete('strava/:userId')
  async stravaDisconnect(@Param('userId') userId: string) {
    await this.stravaService.disconnect(userId);
    return { ok: true };
  }
}