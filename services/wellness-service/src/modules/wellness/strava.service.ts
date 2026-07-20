import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const { Pool } = require('pg');

const DATA_DIR = path.join(process.cwd(), 'data', 'strava');
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID || '';
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

function sanitize(id: string): string {
  return String(id || 'default').replace(/[^a-zA-Z0-9_@.\-]/g, '_').slice(0, 120);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

@Injectable()
export class StravaService {
  private pool: any = null;
  private schemaPromise: Promise<unknown> | null = null;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private hasDatabase() {
    return Boolean(DATABASE_URL);
  }

  private getPoolOptions() {
    const options: any = { connectionString: DATABASE_URL };
    if (DATABASE_URL.includes('sslmode=') || DATABASE_URL.includes('ssl=true') || DATABASE_URL.includes('rds.amazonaws.com')) {
      options.ssl = { rejectUnauthorized: false };
    }
    return options;
  }

  private getPool() {
    if (!this.hasDatabase()) return null;
    if (!this.pool) {
      this.pool = new Pool(this.getPoolOptions());
    }
    return this.pool;
  }

  private async ensureSchema() {
    if (!this.hasDatabase()) return null;
    if (!this.schemaPromise) {
      const pool = this.getPool();
      this.schemaPromise = pool?.query(`
        CREATE TABLE IF NOT EXISTS wellness_strava_tokens (
          user_id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    }

    await this.schemaPromise;
    return this.getPool();
  }

  private tokenPath(userId: string) {
    return path.join(DATA_DIR, `${sanitize(userId)}.json`);
  }

  getAuthUrl(userId: string, redirectUri: string): string {
    if (!STRAVA_CLIENT_ID) return '';
    const params = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:read_all,activity:read',
      state: userId,
    });
    return `https://www.strava.com/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, userId: string): Promise<boolean> {
    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) return false;
    try {
      const body = {
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      };
      const res = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: any = await res.json();
      if (!res.ok || !data.access_token) return false;
      await this.saveTokens(userId, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      });
      return true;
    } catch (err) {
      console.error('Strava token exchange error:', err);
      return false;
    }
  }

  private async saveTokens(userId: string, tokens: StravaTokens) {
    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      await pool?.query(
        `INSERT INTO wellness_strava_tokens (user_id, payload, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET payload = EXCLUDED.payload,
             updated_at = NOW()`,
        [userId, JSON.stringify(tokens)],
      );
      return;
    }

    fs.writeFileSync(this.tokenPath(userId), JSON.stringify(tokens, null, 2), 'utf-8');
  }

  private async loadTokens(userId: string): Promise<StravaTokens | null> {
    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      const result = await pool?.query('SELECT payload FROM wellness_strava_tokens WHERE user_id = $1 LIMIT 1', [userId]);
      return (result?.rows?.[0]?.payload as StravaTokens) || null;
    }

    const fp = this.tokenPath(userId);
    if (!fs.existsSync(fp)) return null;
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch {
      return null;
    }
  }

  private async refreshIfNeeded(userId: string): Promise<string | null> {
    const tokens = await this.loadTokens(userId);
    if (!tokens) return null;

    if (tokens.expires_at > Math.floor(Date.now() / 1000) + 60) {
      return tokens.access_token;
    }

    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) return null;
    try {
      const res = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        }),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      await this.saveTokens(userId, {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      });
      return data.access_token;
    } catch {
      return null;
    }
  }

  async isConnected(userId: string): Promise<boolean> {
    return (await this.loadTokens(userId)) !== null;
  }

  async getTodayActivities(userId: string): Promise<any[]> {
    return this.getRecentActivities(userId, 1);
  }

  async getRecentActivities(userId: string, days = 90): Promise<any[]> {
    const accessToken = await this.refreshIfNeeded(userId);
    if (!accessToken) return [];

    const windowDays = Math.max(1, Math.min(365, Number(days) || 90));
    const after = Math.floor((Date.now() - windowDays * 86400000) / 1000);
    const collected: any[] = [];

    try {
      for (let page = 1; page <= 8; page += 1) {
        const res = await fetch(
          `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50&page=${page}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) break;
        const activities = await res.json();
        if (!Array.isArray(activities) || !activities.length) break;
        collected.push(...activities);
        if (activities.length < 50) break;
      }
      return collected;
    } catch {
      return collected;
    }
  }

  private activityLocalDate(activity: any): string {
    const raw = String(activity?.start_date_local || activity?.start_date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeActivityType(type: string): string {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'trailrun' || normalized === 'virtualrun') return 'run';
    if (normalized === 'hike') return 'walk';
    return normalized;
  }

  collectKnownActivityIds(entries: any[] = []): Set<number> {
    const ids = new Set<number>();
    for (const entry of entries) {
      for (const id of entry?.stravaActivityIds || []) {
        const numeric = Number(id);
        if (Number.isFinite(numeric) && numeric > 0) ids.add(numeric);
      }
    }
    return ids;
  }

  filterNewActivities(activities: any[] = [], knownIds: Set<number>) {
    const newActivities = activities.filter((activity) => !knownIds.has(Number(activity?.id)));
    return {
      newActivities,
      skipped: Math.max(0, activities.length - newActivities.length),
    };
  }

  private summarizeRun(activity: any) {
    const distanceM = Number(activity.distance || 0);
    const movingSec = Number(activity.moving_time || 0);
    const elapsedSec = Number(activity.elapsed_time || movingSec || 0);
    const distanceKm = round(distanceM / 1000, 2);
    const minutes = Math.max(1, Math.round(movingSec / 60));
    const avgSpeedKmh = movingSec > 0 ? round((distanceM / movingSec) * 3.6, 2) : 0;
    const maxSpeedKmh = round(Number(activity.max_speed || 0) * 3.6, 2);
    const paceMinPerKm = distanceKm > 0 ? round(minutes / distanceKm, 2) : null;
    const elevationGainM = round(Number(activity.total_elevation_gain || 0), 1);
    const avgHeartrate = activity.average_heartrate ? round(Number(activity.average_heartrate), 0) : null;
    const maxHeartrate = activity.max_heartrate ? round(Number(activity.max_heartrate), 0) : null;
    const calories = activity.calories ? round(Number(activity.calories), 0) : null;

    return {
      id: activity.id,
      name: activity.name || 'Run',
      date: this.activityLocalDate(activity),
      type: String(activity.type || '').toLowerCase(),
      distanceKm,
      minutes,
      movingSeconds: movingSec,
      elapsedSeconds: elapsedSec,
      avgSpeedKmh,
      maxSpeedKmh,
      paceMinPerKm,
      elevationGainM,
      avgHeartrate,
      maxHeartrate,
      calories,
      stravaId: activity.id,
    };
  }

  mapToWellnessFields(activities: any[]): Record<string, number> {
    const fields: Record<string, number> = {};

    for (const a of activities) {
      const type = this.normalizeActivityType(a.type);
      const distKm = round((a.distance || 0) / 1000, 2);
      const mins = Math.round((a.moving_time || 0) / 60);

      if (type === 'run') {
        fields.runningDistanceKm = round((fields.runningDistanceKm || 0) + distKm, 2);
        fields.runningMinutes = (fields.runningMinutes || 0) + mins;
      } else if (type === 'walk') {
        fields.walkingDistanceKm = round((fields.walkingDistanceKm || 0) + distKm, 2);
        fields.walkingMinutes = (fields.walkingMinutes || 0) + mins;
      } else if (type === 'swim') {
        fields.swimmingMinutes = (fields.swimmingMinutes || 0) + mins;
      } else if (type === 'ride' || type === 'virtualride') {
        fields.cyclingDistanceKm = round((fields.cyclingDistanceKm || 0) + distKm, 2);
        fields.cyclingMinutes = (fields.cyclingMinutes || 0) + mins;
      } else if (type === 'workout' || type === 'weighttraining' || type === 'crossfit') {
        fields.exerciseMinutes = (fields.exerciseMinutes || 0) + mins;
      }
    }
    return fields;
  }

  buildWellnessEntriesFromActivities(activities: any[] = []) {
    const byDate = new Map<string, any>();

    for (const activity of activities) {
      const type = this.normalizeActivityType(activity.type);
      const date = this.activityLocalDate(activity);
      const current = byDate.get(date) || {
        date,
        runningDistanceKm: 0,
        runningMinutes: 0,
        walkingDistanceKm: 0,
        walkingMinutes: 0,
        swimmingMinutes: 0,
        cyclingDistanceKm: 0,
        cyclingMinutes: 0,
        exerciseMinutes: 0,
        yogaMinutes: 0,
        footballMinutes: 0,
        badmintonMinutes: 0,
        stravaAvgHeartRate: null as number | null,
        stravaMaxHeartRate: null as number | null,
        estimatedSteps: 0,
        _hrWeightMins: 0,
        source: 'strava',
        stravaActivityIds: [] as number[],
        stravaRuns: [] as any[],
      };

      const distKm = round((activity.distance || 0) / 1000, 2);
      const mins = Math.round((activity.moving_time || 0) / 60);
      const activityId = Number(activity.id);
      if (Number.isFinite(activityId) && activityId > 0) current.stravaActivityIds.push(activityId);

      const avgHr = activity.average_heartrate ? round(Number(activity.average_heartrate), 0) : null;
      const maxHr = activity.max_heartrate ? round(Number(activity.max_heartrate), 0) : null;
      if (avgHr && mins > 0) {
        const prevWeight = Number(current._hrWeightMins || 0);
        const prevAvg = Number(current.stravaAvgHeartRate || 0);
        const nextWeight = prevWeight + mins;
        current.stravaAvgHeartRate = nextWeight > 0
          ? Math.round(((prevAvg * prevWeight) + (avgHr * mins)) / nextWeight)
          : avgHr;
        current._hrWeightMins = nextWeight;
      }
      if (maxHr) {
        current.stravaMaxHeartRate = Math.max(Number(current.stravaMaxHeartRate || 0), maxHr) || maxHr;
      }

      if (type === 'run') {
        current.runningDistanceKm = round(current.runningDistanceKm + distKm, 2);
        current.runningMinutes += mins;
        current.stravaRuns.push(this.summarizeRun(activity));
      } else if (type === 'walk') {
        current.walkingDistanceKm = round(current.walkingDistanceKm + distKm, 2);
        current.walkingMinutes += mins;
      } else if (type === 'swim') {
        current.swimmingMinutes += mins;
      } else if (type === 'ride' || type === 'virtualride') {
        current.cyclingDistanceKm = round(current.cyclingDistanceKm + distKm, 2);
        current.cyclingMinutes += mins;
      } else if (type === 'workout' || type === 'weighttraining' || type === 'crossfit') {
        current.exerciseMinutes += mins;
      } else if (type === 'yoga') {
        current.yogaMinutes += mins;
      }

      byDate.set(date, current);
    }

    return [...byDate.values()]
      .map((entry) => {
        const estimatedSteps = Math.round(
          (Number(entry.walkingDistanceKm || 0) + Number(entry.runningDistanceKm || 0)) * 1312,
        );
        const { _hrWeightMins, ...rest } = entry;
        return {
          ...rest,
          estimatedSteps,
          stravaAvgHeartRate: rest.stravaAvgHeartRate || null,
          stravaMaxHeartRate: rest.stravaMaxHeartRate || null,
        };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  buildRunInsights(activities: any[] = []) {
    const runs = activities
      .filter((activity) => String(activity.type || '').toLowerCase() === 'run')
      .map((activity) => this.summarizeRun(activity))
      .filter((run) => run.distanceKm > 0 && run.minutes > 0)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    if (!runs.length) {
      return {
        connected: true,
        runCount: 0,
        totalDistanceKm: 0,
        totalMinutes: 0,
        avgPaceMinPerKm: null,
        avgSpeedKmh: null,
        maxSpeedKmh: null,
        bestPaceMinPerKm: null,
        longestRunKm: null,
        elevationGainM: 0,
        avgHeartRate: null,
        maxHeartRate: null,
        recentRuns: [],
        fastestRuns: [],
        paceByMinuteBuckets: [],
      };
    }

    const totalDistanceKm = round(runs.reduce((sum, run) => sum + run.distanceKm, 0), 2);
    const totalMinutes = runs.reduce((sum, run) => sum + run.minutes, 0);
    const avgPaceMinPerKm = totalDistanceKm > 0 ? round(totalMinutes / totalDistanceKm, 2) : null;
    const avgSpeedKmh = totalMinutes > 0 ? round((totalDistanceKm / totalMinutes) * 60, 2) : null;
    const maxSpeedKmh = round(Math.max(...runs.map((run) => run.maxSpeedKmh || 0)), 2);
    const bestPaceRun = [...runs].sort((a, b) => (a.paceMinPerKm || 999) - (b.paceMinPerKm || 999))[0];
    const longestRun = [...runs].sort((a, b) => b.distanceKm - a.distanceKm)[0];
    const elevationGainM = round(runs.reduce((sum, run) => sum + (run.elevationGainM || 0), 0), 1);
    const hrRuns = runs.filter((run) => run.avgHeartrate || run.maxHeartrate);
    const avgHeartRate = hrRuns.length
      ? Math.round(hrRuns.reduce((sum, run) => sum + Number(run.avgHeartrate || 0), 0) / hrRuns.length)
      : null;
    const maxHeartRate = hrRuns.length
      ? Math.max(...hrRuns.map((run) => Number(run.maxHeartrate || 0)))
      : null;

    const paceByMinuteBuckets = [
      { label: 'Under 5:00', max: 5, count: 0 },
      { label: '5:00–6:00', max: 6, count: 0 },
      { label: '6:00–7:00', max: 7, count: 0 },
      { label: '7:00–8:00', max: 8, count: 0 },
      { label: '8:00+', max: 999, count: 0 },
    ];
    for (const run of runs) {
      const pace = Number(run.paceMinPerKm || 0);
      if (!pace) continue;
      const bucket = paceByMinuteBuckets.find((entry) => pace < entry.max) || paceByMinuteBuckets[paceByMinuteBuckets.length - 1];
      bucket.count += 1;
    }

    return {
      connected: true,
      runCount: runs.length,
      totalDistanceKm,
      totalMinutes,
      avgPaceMinPerKm,
      avgSpeedKmh,
      maxSpeedKmh: maxSpeedKmh || null,
      bestPaceMinPerKm: bestPaceRun?.paceMinPerKm || null,
      bestPaceRun,
      longestRunKm: longestRun?.distanceKm || null,
      longestRun,
      elevationGainM,
      avgHeartRate,
      maxHeartRate,
      recentRuns: runs.slice(0, 12),
      fastestRuns: [...runs].sort((a, b) => (b.maxSpeedKmh || 0) - (a.maxSpeedKmh || 0)).slice(0, 8),
      paceByMinuteBuckets,
    };
  }

  async disconnect(userId: string): Promise<void> {
    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      await pool?.query('DELETE FROM wellness_strava_tokens WHERE user_id = $1', [userId]);
      return;
    }

    const fp = this.tokenPath(userId);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
}
