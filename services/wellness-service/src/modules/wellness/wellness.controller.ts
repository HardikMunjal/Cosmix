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
  async saveUserData(@Param('userId') userId: string, @Body() body: { entries?: any[]; form?: any; runningShoes?: any[] }) {
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

  @Get('analytics/:userId')
  async getAnalytics(
    @Param('userId') userId: string,
    @Query('days') days?: string,
  ) {
    return this.storageService.loadAnalytics(userId, Number(days || 90));
  }

  @Get('plan-summary/:userId')
  async getPlanSummary(@Param('userId') userId: string) {
    return this.storageService.loadActivePlanSummary(userId);
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
    // Redirect URI must be the wellness-service callback registered in Strava
    let serverCallback = String(process.env.STRAVA_REDIRECT_URI || '').trim();
    if (!serverCallback && redirectUri) {
      try {
        const parsed = new URL(redirectUri);
        parsed.port = String(process.env.WELLNESS_PORT || process.env.PORT || '3004');
        parsed.pathname = '/wellness/strava/callback';
        parsed.search = '';
        parsed.hash = '';
        serverCallback = parsed.toString();
      } catch {
        serverCallback = redirectUri.replace(/\/wellness.*$/i, '/wellness/strava/callback');
      }
    }
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
    const frontendBase = String(
      process.env.WEB_APP_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || process.env.FRONTEND_URL
      || 'http://localhost:3005',
    ).replace(/\/$/, '');
    const frontendUrl = `${frontendBase}/wellness?strava=${ok ? 'ok' : 'fail'}`;
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
  async stravaActivities(
    @Param('userId') userId: string,
    @Query('days') days?: string,
    @Query('import') shouldImport?: string,
  ) {
    const windowDays = Number(days) || 90;
    const activities = await this.stravaService.getRecentActivities(userId, windowDays);
    const existingState = await this.storageService.load(userId);
    const knownIds = this.stravaService.collectKnownActivityIds(existingState.entries || []);
    const { newActivities, skipped } = this.stravaService.filterNewActivities(activities, knownIds);
    const fields = this.stravaService.mapToWellnessFields(
      activities.filter((activity) => {
        const date = String(activity.start_date_local || activity.start_date || '').slice(0, 10);
        return date === new Date().toISOString().slice(0, 10);
      }),
    );
    const entries = this.stravaService.buildWellnessEntriesFromActivities(newActivities);
    const insights = this.stravaService.buildRunInsights(activities);

    let imported = 0;
    let newActivitiesCount = newActivities.length;
    let newDays = 0;
    const alreadyUpToDate = newActivities.length === 0;

    if (String(shouldImport || '1') !== '0' && newActivities.length) {
      const result = await this.storageService.importStravaEntries(userId, entries);
      imported = result.newDays;
      newDays = result.newDays;
    }

    return {
      activities: activities.length,
      newActivities: newActivitiesCount,
      skippedActivities: skipped,
      newDays,
      alreadyUpToDate,
      imported,
      fields,
      entries,
      insights,
    };
  }

  @Get('strava/insights/:userId')
  async stravaInsights(
    @Param('userId') userId: string,
    @Query('days') days?: string,
  ) {
    const connected = await this.stravaService.isConnected(userId);
    if (!connected) {
      return { connected: false, runCount: 0, recentRuns: [], paceByMinuteBuckets: [] };
    }
    const activities = await this.stravaService.getRecentActivities(userId, Number(days) || 90);
    return this.stravaService.buildRunInsights(activities);
  }

  @Delete('strava/:userId')
  async stravaDisconnect(@Param('userId') userId: string) {
    await this.stravaService.disconnect(userId);
    return { ok: true };
  }
}