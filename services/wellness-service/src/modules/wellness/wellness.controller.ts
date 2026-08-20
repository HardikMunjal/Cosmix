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
    @Query('full') full?: string,
  ) {
    const existingState = await this.storageService.load(userId);
    const storedIds = this.stravaService.collectStoredActivityIds(existingState.entries || []);
    const deletedIds = new Set<number>();
    for (const id of (existingState as any)?.deletedStravaActivityIds || []) {
      const numeric = Number(id);
      if (Number.isFinite(numeric) && numeric > 0) deletedIds.add(numeric);
    }
    const isFirstSync = storedIds.all.size === 0 || String(full || '') === '1';
    const windowDays = isFirstSync
      ? Math.max(Number(days) || 730, 365)
      : (Number(days) || 90);

    // Import the activity list first. Heart-rate detail calls used to run before save and
    // could time out, so walks never landed even when Strava returned them.
    let activities: any[] = [];
    try {
      activities = await this.stravaService.getRecentActivities(userId, windowDays, {
        enrichHeartRate: false,
      });
    } catch (err) {
      const stravaError = err instanceof Error ? err.message : 'Strava sync failed';
      console.error('Strava activities fetch failed:', stravaError);
      return {
        activities: 0,
        newActivities: 0,
        skippedActivities: 0,
        newWalks: 0,
        newYoga: 0,
        newDays: 0,
        alreadyUpToDate: false,
        imported: 0,
        firstSync: isFirstSync,
        windowDays,
        heartRateUpdated: 0,
        detailsEnriched: 0,
        stravaError,
        fields: {},
        entries: [],
        insights: null,
        heartRateDays: 0,
      };
    }
    const { newActivities, skipped } = this.stravaService.filterNewActivities(activities, storedIds, deletedIds);
    const todayLocal = new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    const fields = this.stravaService.mapToWellnessFields(
      activities.filter((activity) => {
        const date = String(activity.start_date_local || activity.start_date || '').slice(0, 10);
        return date === todayLocal;
      }),
    );
    const entries = this.stravaService.buildWellnessEntriesFromActivities(newActivities);
    const insights = this.stravaService.buildRunInsights(activities);
    const newWalks = newActivities.filter((activity) => this.stravaService.activityKind(activity) === 'walk').length;
    const newYoga = newActivities.filter((activity) => this.stravaService.activityKind(activity) === 'yoga').length;

    let imported = 0;
    let newActivitiesCount = newActivities.length;
    let newDays = 0;
    const alreadyUpToDate = newActivities.length === 0;
    let state = existingState;
    let heartRateUpdated = 0;

    if (String(shouldImport || '1') !== '0' && newActivities.length) {
      const result = await this.storageService.importStravaEntries(userId, entries);
      imported = result.newDays;
      newDays = result.newDays;
      state = result.state;
    }

    let enrichedActivities = activities;
    if (String(shouldImport || '1') !== '0' && activities.length) {
      try {
        enrichedActivities = await this.stravaService.enrichActivitiesHeartRateForUser(userId, activities);
        const hrResult = await this.storageService.refreshStravaHeartRate(
          userId,
          this.stravaService.buildWellnessEntriesFromActivities(enrichedActivities),
        );
        heartRateUpdated = hrResult.updatedDays;
        state = hrResult.state;
      } catch (err) {
        console.error('Strava HR refresh failed after import:', err);
      }
    }

    // Persist map/streams/splits for newest runs so detail pages work offline (no Strava Premium needed).
    let detailsEnriched = 0;
    if (String(shouldImport || '1') !== '0') {
      try {
        const runIds = activities
          .filter((activity) => this.stravaService.activityKind(activity) === 'run')
          .map((activity) => Number(activity?.id))
          .filter((id) => id > 0);
        const walkIds = activities
          .filter((activity) => this.stravaService.activityKind(activity) === 'walk')
          .map((activity) => Number(activity?.id))
          .filter((id) => id > 0);
        const yogaIds = activities
          .filter((activity) => this.stravaService.activityKind(activity) === 'yoga')
          .map((activity) => Number(activity?.id))
          .filter((id) => id > 0);
        const sportIds = activities
          .filter((activity) => ['badminton', 'swim', 'ride', 'virtualride', 'meditation'].includes(this.stravaService.activityKind(activity)))
          .map((activity) => Number(activity?.id))
          .filter((id) => id > 0);
        const detailResult = await this.stravaService.enrichRecentActivityDetails(
          userId,
          [...runIds, ...walkIds, ...yogaIds, ...sportIds],
          { maxActivities: isFirstSync ? 20 : 28 },
        );
        detailsEnriched = detailResult.enriched || 0;
      } catch (err) {
        console.error('Strava run detail enrich failed after import:', err);
      }
    }

    return {
      activities: activities.length,
      newActivities: newActivitiesCount,
      skippedActivities: skipped,
      newWalks,
      newYoga,
      newDays,
      alreadyUpToDate: alreadyUpToDate && heartRateUpdated === 0 && detailsEnriched === 0,
      imported,
      firstSync: isFirstSync,
      windowDays,
      heartRateUpdated,
      detailsEnriched,
      fields,
      entries,
      insights,
      heartRateDays: (state.entries || []).filter((entry) => Number(entry.stravaAvgHeartRate || entry.heartRateAvg || 0) > 0).length,
    };
  }

  @Get('strava/maps/:userId')
  async listStravaRunMaps(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.stravaService.listActivityMapCards(userId, {
      limit: Number(limit) || 12,
    });
  }

  @Put('strava/runs/:userId/:activityId/shoe')
  async assignStravaRunShoe(
    @Param('userId') userId: string,
    @Param('activityId') activityId: string,
    @Body() body: { shoeId?: string },
  ) {
    const result = await this.storageService.assignStravaRunShoe(userId, Number(activityId), String(body?.shoeId || ''));
    return result;
  }

  @Delete('strava/runs/:userId/:activityId')
  async deleteStravaRun(
    @Param('userId') userId: string,
    @Param('activityId') activityId: string,
  ) {
    const result = await this.storageService.deleteStravaRun(userId, Number(activityId));
    if (result?.ok) {
      await this.stravaService.deleteActivityDetail(userId, Number(activityId));
    }
    return result;
  }

  @Get('strava/runs/:userId/:activityId')
  async getStravaRunDetail(
    @Param('userId') userId: string,
    @Param('activityId') activityId: string,
    @Query('force') force?: string,
  ) {
    const detail = await this.stravaService.getActivityDetail(userId, Number(activityId), {
      force: String(force || '') === '1',
    });

    // Attach shoe / summary from stored wellness entries when available.
    try {
      const state = await this.storageService.load(userId);
      const runs = (state.entries || []).flatMap((entry: any) => entry.stravaRuns || []);
      const stored = runs.find((run: any) => Number(run.stravaId || run.id) === Number(activityId));
      if (stored && detail?.ok !== false) {
        return {
          ...detail,
          summary: {
            ...(detail.summary || {}),
            ...stored,
            ...(detail.summary || {}),
            shoeId: stored.shoeId || detail.summary?.shoeId || '',
          },
        };
      }
      if ((!detail || detail.ok === false) && stored) {
        return {
          ok: true,
          activityId: Number(activityId),
          summary: stored,
          polyline: [],
          streams: { time: [], distance: [], heartrate: [], velocityKmh: [], altitude: [], latlng: [] },
          splits: [],
          heartrateZones: stored.heartrateZones || [],
          hasMap: false,
          hasHeartRate: Boolean(stored.avgHeartrate),
          offline: true,
          needsEnrich: true,
        };
      }
    } catch (_) { /* ignore */ }

    return detail;
  }

  @Post('strava/runs/:userId/enrich-details')
  async enrichStravaRunDetails(
    @Param('userId') userId: string,
    @Body() body: { activityIds?: number[]; limit?: number } = {},
  ) {
    let ids = Array.isArray(body?.activityIds) ? body.activityIds.map(Number) : [];
    if (!ids.length) {
      const state = await this.storageService.load(userId);
      ids = (state.entries || [])
        .flatMap((entry: any) => (entry.stravaRuns || []).map((run: any) => Number(run.stravaId || run.id)))
        .filter((id: number) => id > 0)
        .slice(0, 40);
    }
    return this.stravaService.enrichRecentActivityDetails(userId, ids, {
      maxActivities: Number(body?.limit) || 8,
    });
  }

  @Get('strava/insights/:userId')
  async stravaInsights(
    @Param('userId') userId: string,
    @Query('days') days?: string,
    @Query('live') live?: string,
  ) {
    const connected = await this.stravaService.isConnected(userId);
    const windowDays = Number(days) || 180;
    const wantLive = String(live || '') === '1';

    // Fast path: build insights from Cosmix activity_details (no Strava, no giant wellness JSON).
    let storedRuns = await this.stravaService.listStoredRunSummaries(userId, {
      days: windowDays,
      limit: 80,
    });

    // Fallback: wellness entries if details table is thin.
    if (storedRuns.length < 3) {
      try {
        const state = await this.storageService.load(userId);
        const cutoffMs = Date.now() - windowDays * 86400000;
        const fromEntries = (state.entries || [])
          .flatMap((entry: any) => entry.stravaRuns || [])
          .filter((run: any) => {
            const distance = Number(run?.distanceKm || 0);
            if (!(distance > 0)) return false;
            const started = Date.parse(String(run?.date || ''));
            return Number.isFinite(started) ? started >= cutoffMs : true;
          });
        if (fromEntries.length > storedRuns.length) {
          storedRuns = await this.stravaService.attachStoredDetailFields(userId, fromEntries, { maxLookups: 40 });
        }
      } catch (_) { /* keep details-only */ }
    }

    const dbInsights = this.stravaService.buildRunInsightsFromSummaries(storedRuns);

    if (!wantLive && dbInsights.runCount > 0) {
      return {
        ...dbInsights,
        connected: connected || dbInsights.runCount > 0,
        source: 'database',
        live: false,
        heartRateAvailable: Boolean(dbInsights.avgHeartRate || dbInsights.heartRateZoneRuns),
        zoneSource: dbInsights.heartRateZoneRuns ? 'database' : 'none',
        paceZoneSource: dbInsights.paceZoneRuns ? 'database' : 'none',
        premiumRequired: false,
      };
    }

    if (!connected) {
      return {
        ...dbInsights,
        connected: dbInsights.runCount > 0,
        source: 'database',
        live: false,
        heartRateAvailable: Boolean(dbInsights.avgHeartRate || dbInsights.heartRateZoneRuns),
      };
    }

    const activities = await this.stravaService.getRecentActivities(userId, windowDays, {
      enrichHeartRate: true,
    }).catch((err) => {
      console.error('Strava insights fetch failed:', err);
      return [];
    });
    if (!activities.length) {
      return {
        ...dbInsights,
        connected: true,
        source: 'database',
        live: false,
        heartRateAvailable: Boolean(dbInsights.avgHeartRate || dbInsights.heartRateZoneRuns),
      };
    }
    const zoneEnrichment = await this.stravaService.enrichActivitiesWithHeartRateZones(userId, activities, {
      maxActivities: 25,
    });
    const insights = this.stravaService.buildRunInsights(zoneEnrichment.activities);
    return {
      ...insights,
      source: 'strava',
      live: true,
      zoneSource: zoneEnrichment.zoneSource,
      paceZoneSource: zoneEnrichment.paceZoneSource,
      athleteZones: zoneEnrichment.athleteZones,
      premiumRequired: zoneEnrichment.premiumRequired,
      heartRateAvailable: zoneEnrichment.heartRateAvailable,
    };
  }

  @Delete('strava/:userId')
  async stravaDisconnect(@Param('userId') userId: string) {
    await this.stravaService.disconnect(userId);
    return { ok: true };
  }
}