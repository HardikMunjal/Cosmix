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
      scope: 'read,activity:read_all,activity:read,profile:read_all',
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

  async getRecentActivities(userId: string, days = 90, options: { enrichHeartRate?: boolean } = {}): Promise<any[]> {
    const accessToken = await this.refreshIfNeeded(userId);
    if (!accessToken) return [];

    const windowDays = Math.max(1, Math.min(1095, Number(days) || 90));
    const after = Math.floor((Date.now() - windowDays * 86400000) / 1000);
    const collected: any[] = [];
    const maxPages = windowDays > 180 ? 40 : windowDays > 90 ? 20 : 8;

    try {
      for (let page = 1; page <= maxPages; page += 1) {
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

      if (options.enrichHeartRate !== false) {
        return this.enrichActivitiesWithHeartRate(accessToken, collected);
      }
      return collected;
    } catch {
      return collected;
    }
  }

  private async fetchActivityDetail(accessToken: string, activityId: number): Promise<any | null> {
    try {
      const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  private async enrichActivitiesWithHeartRate(accessToken: string, activities: any[] = []): Promise<any[]> {
    const cutoffMs = Date.now() - 21 * 86400000;
    const needsDetail = activities.filter((activity) => {
      const avg = Number(activity?.average_heartrate || 0);
      const max = Number(activity?.max_heartrate || 0);
      if (avg > 0 || max > 0) return false;
      const started = Date.parse(String(activity?.start_date_local || activity?.start_date || ''));
      const recent = Number.isFinite(started) ? started >= cutoffMs : true;
      // Prefer flagged HR activities; also probe recent runs in case list summary omitted BPM.
      const likelyHr = Boolean(activity?.has_heartrate) || recent;
      return likelyHr && this.normalizeActivityType(activity.type) === 'run';
    });

    // Keep sync snappy — detail calls are sequential and previously timed out incremental syncs.
    const toFetch = needsDetail.slice(0, 12);
    const detailById = new Map<number, any>();
    for (const activity of toFetch) {
      const id = Number(activity?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const detail = await this.fetchActivityDetail(accessToken, id);
      if (detail) detailById.set(id, detail);
    }

    return activities.map((activity) => {
      const id = Number(activity?.id);
      const detail = detailById.get(id);
      if (!detail) return activity;
      return {
        ...activity,
        average_heartrate: activity.average_heartrate || detail.average_heartrate || null,
        max_heartrate: activity.max_heartrate || detail.max_heartrate || null,
        has_heartrate: activity.has_heartrate || detail.has_heartrate || false,
        calories: activity.calories || detail.calories || null,
      };
    });
  }

  private readHeartRate(activity: any) {
    const avg = Number(activity?.average_heartrate || activity?.average_hr || 0);
    const max = Number(activity?.max_heartrate || activity?.max_hr || 0);
    return {
      avgHeartrate: avg > 0 ? round(avg, 0) : null,
      maxHeartrate: max > 0 ? round(max, 0) : null,
    };
  }

  private async fetchActivityZones(accessToken: string, activityId: number): Promise<any[] | null> {
    try {
      const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/zones`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const payload = await res.json();
      return Array.isArray(payload) ? payload : null;
    } catch {
      return null;
    }
  }

  private async fetchAthleteZones(accessToken: string): Promise<any | null> {
    try {
      const res = await fetch('https://www.strava.com/api/v3/athlete/zones', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  private async fetchHeartRateStream(accessToken: string, activityId: number): Promise<number[] | null> {
    try {
      const res = await fetch(
        `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate&key_by_type=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      const payload: any = await res.json();
      const series = payload?.heartrate?.data
        || (Array.isArray(payload) ? payload.find((item: any) => item?.type === 'heartrate')?.data : null);
      return Array.isArray(series) ? series.map((value: any) => Number(value)).filter((value: number) => value > 0) : null;
    } catch {
      return null;
    }
  }

  private defaultHrZoneBounds(maxHr = 190) {
    const ceiling = Math.max(140, Math.min(230, Number(maxHr) || 190));
    // Classic 5-zone % of max HR
    return [
      { zone: 1, label: 'Z1 Easy', min: 0, max: Math.round(ceiling * 0.6) },
      { zone: 2, label: 'Z2 Endurance', min: Math.round(ceiling * 0.6), max: Math.round(ceiling * 0.7) },
      { zone: 3, label: 'Z3 Tempo', min: Math.round(ceiling * 0.7), max: Math.round(ceiling * 0.8) },
      { zone: 4, label: 'Z4 Threshold', min: Math.round(ceiling * 0.8), max: Math.round(ceiling * 0.9) },
      { zone: 5, label: 'Z5 Max', min: Math.round(ceiling * 0.9), max: ceiling + 1 },
    ];
  }

  private parseAthleteHrZones(athleteZones: any) {
    const heart = athleteZones?.heart_rate || athleteZones?.heartrate || null;
    const zones = Array.isArray(heart?.zones) ? heart.zones : null;
    if (!zones?.length) return null;
    return zones.map((zone: any, index: number) => ({
      zone: index + 1,
      label: `Z${index + 1}`,
      min: Number(zone.min || zone.min_hr || 0),
      max: Number(zone.max || zone.max_hr || -1),
    }));
  }

  private zoneLabel(index: number, min: number, max: number) {
    const labels = ['Z1 Easy', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 Max', 'Z6+', 'Z7'];
    const range = max > 0 ? `${min}–${max}` : `${min}+`;
    return `${labels[index] || `Z${index + 1}`} (${range})`;
  }

  private normalizeHrZoneBuckets(buckets: any[] = [], fallbackMaxHr = 190) {
    if (!Array.isArray(buckets) || !buckets.length) return [];
    return buckets.map((bucket, index) => {
      const min = Number(bucket.min || 0);
      const maxRaw = Number(bucket.max);
      const max = maxRaw < 0 ? Math.max(fallbackMaxHr, min + 1) : maxRaw;
      const seconds = Math.max(0, Number(bucket.time || 0));
      return {
        zone: index + 1,
        label: this.zoneLabel(index, min, maxRaw < 0 ? 0 : max),
        min,
        max: maxRaw < 0 ? null : max,
        seconds,
        minutes: round(seconds / 60, 1),
      };
    }).filter((bucket) => bucket.seconds > 0 || bucket.zone <= 5);
  }

  private computeZonesFromStream(samples: number[] = [], zoneBounds: Array<{ zone: number; label: string; min: number; max: number }>) {
    if (!samples.length || !zoneBounds.length) return [];
    const secondsPerSample = 1; // Strava HR streams are typically 1Hz
    const totals = zoneBounds.map((bound) => ({ ...bound, seconds: 0, minutes: 0 }));
    for (const bpm of samples) {
      const match = totals.find((zone, index) => {
        const upper = zone.max == null || zone.max < 0 ? Number.POSITIVE_INFINITY : zone.max;
        const isLast = index === totals.length - 1;
        return bpm >= zone.min && (isLast ? bpm <= upper || bpm >= zone.min : bpm < upper);
      }) || totals[totals.length - 1];
      match.seconds += secondsPerSample;
    }
    return totals.map((zone) => ({
      ...zone,
      minutes: round(zone.seconds / 60, 1),
      label: this.zoneLabel(zone.zone - 1, zone.min, zone.max < 0 ? 0 : zone.max),
    }));
  }

  private paceLabelFromMs(minMs: number, maxMs: number) {
    const toPace = (metersPerSec: number | null) => {
      if (!Number.isFinite(metersPerSec as number) || !metersPerSec || metersPerSec <= 0) return null;
      const minPerKm = 1000 / (metersPerSec * 60);
      const minutes = Math.floor(minPerKm);
      const seconds = Math.round((minPerKm - minutes) * 60);
      return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };
    const slow = toPace(minMs > 0 ? minMs : null);
    const fast = maxMs < 0 ? null : toPace(maxMs);
    if (slow && fast) return `${fast}-${slow}/km`;
    if (fast) return `slower than ${fast}/km`;
    if (slow) return `faster than ${slow}/km`;
    return 'pace zone';
  }

  private normalizePaceZoneBuckets(buckets: any[] = []) {
    if (!Array.isArray(buckets) || !buckets.length) return [];
    return buckets.map((bucket, index) => {
      const min = Number(bucket.min || 0);
      const maxRaw = Number(bucket.max);
      const seconds = Math.max(0, Number(bucket.time || 0));
      return {
        zone: index + 1,
        label: `Z${index + 1} ${this.paceLabelFromMs(min, maxRaw)}`,
        min,
        max: maxRaw < 0 ? null : maxRaw,
        seconds,
        minutes: round(seconds / 60, 1),
      };
    }).filter((bucket) => bucket.seconds > 0 || bucket.zone <= 5);
  }

  async enrichActivitiesWithHeartRateZones(
    userId: string,
    activities: any[] = [],
    options: { maxActivities?: number } = {},
  ) {
    const accessToken = await this.refreshIfNeeded(userId);
    if (!accessToken) {
      return {
        activities,
        athleteZones: null,
        zoneSource: 'none',
        paceZoneSource: 'none',
        premiumRequired: false,
        heartRateAvailable: false,
      };
    }

    const athleteZones = await this.fetchAthleteZones(accessToken);
    const boundZones = this.parseAthleteHrZones(athleteZones) || this.defaultHrZoneBounds(190);
    // Always probe recent runs — Amazfit/etc often omit has_heartrate but still expose pace zones.
    const candidates = activities
      .filter((activity) => this.normalizeActivityType(activity.type) === 'run')
      .slice(0, Math.max(5, Math.min(40, Number(options.maxActivities) || 25)));

    let premiumBlocked = false;
    let usedActivityZones = false;
    let usedStreamZones = false;
    let usedPaceZones = false;
    let heartRateAvailable = false;
    const enriched = [];

    for (const activity of activities) {
      const id = Number(activity?.id);
      if (!candidates.some((item) => Number(item.id) === id)) {
        enriched.push(activity);
        continue;
      }

      const zonesPayload = await this.fetchActivityZones(accessToken, id);
      const hrZone = Array.isArray(zonesPayload)
        ? zonesPayload.find((item) => String(item?.type || '').toLowerCase() === 'heartrate')
        : null;
      const paceZone = Array.isArray(zonesPayload)
        ? zonesPayload.find((item) => String(item?.type || '').toLowerCase() === 'pace')
        : null;

      let next = { ...activity };
      if (paceZone?.distribution_buckets?.length) {
        usedPaceZones = true;
        next = {
          ...next,
          paceZones: this.normalizePaceZoneBuckets(paceZone.distribution_buckets),
          paceZoneSource: 'activity_zones',
        };
      }

      if (hrZone?.distribution_buckets?.length) {
        const buckets = this.normalizeHrZoneBuckets(hrZone.distribution_buckets, Number(hrZone.max || activity.max_heartrate || 190));
        usedActivityZones = true;
        heartRateAvailable = true;
        enriched.push({
          ...next,
          average_heartrate: activity.average_heartrate || null,
          max_heartrate: activity.max_heartrate || hrZone.max || null,
          has_heartrate: true,
          heartrateZones: buckets,
          sufferScore: hrZone.score || activity.suffer_score || null,
          zoneSource: 'activity_zones',
        });
        continue;
      }

      if (zonesPayload === null) {
        // 403/404 often means non-premium for /zones — fall back to stream samples.
        premiumBlocked = true;
      }

      const stream = await this.fetchHeartRateStream(accessToken, id);
      if (stream?.length) {
        const buckets = this.computeZonesFromStream(stream, boundZones);
        const avg = Math.round(stream.reduce((sum, value) => sum + value, 0) / stream.length);
        const max = Math.max(...stream);
        usedStreamZones = true;
        heartRateAvailable = true;
        enriched.push({
          ...next,
          average_heartrate: activity.average_heartrate || avg,
          max_heartrate: activity.max_heartrate || max,
          has_heartrate: true,
          heartrateZones: buckets,
          zoneSource: 'stream',
        });
        continue;
      }

      enriched.push(next);
    }

    const zoneSource: 'activity_zones' | 'stream' | 'mixed' | 'none' = usedActivityZones && usedStreamZones
      ? 'mixed'
      : usedActivityZones
        ? 'activity_zones'
        : usedStreamZones
          ? 'stream'
          : 'none';

    return {
      activities: enriched,
      athleteZones: boundZones,
      zoneSource,
      paceZoneSource: usedPaceZones ? 'activity_zones' : 'none',
      premiumRequired: premiumBlocked && zoneSource === 'none' && !usedPaceZones,
      heartRateAvailable,
    };
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

  private sanitizeMaxSpeedKmh(rawMaxKmh: number, avgSpeedKmh: number, activityType: string) {
    if (!(rawMaxKmh > 0)) return null;
    const type = this.normalizeActivityType(activityType);

    // Strava max_speed is often a single GPS jitter spike — clamp against avg pace.
    if (type === 'run') {
      const hardCap = 28; // ~ sprint burst ceiling for recreational GPS runs
      const relativeCap = avgSpeedKmh > 0 ? avgSpeedKmh * 1.85 : hardCap;
      if (avgSpeedKmh > 0 && rawMaxKmh > avgSpeedKmh * 2.4) {
        return round(Math.min(relativeCap, hardCap), 2);
      }
      return round(Math.min(rawMaxKmh, hardCap, relativeCap), 2);
    }
    if (type === 'walk') {
      const hardCap = 10;
      const relativeCap = avgSpeedKmh > 0 ? avgSpeedKmh * 1.6 : hardCap;
      return round(Math.min(rawMaxKmh, hardCap, relativeCap), 2);
    }
    if (type === 'ride' || type === 'virtualride') {
      return round(Math.min(rawMaxKmh, 90), 2);
    }
    return round(rawMaxKmh, 2);
  }

  private summarizeRun(activity: any) {
    const distanceM = Number(activity.distance || 0);
    const movingSec = Number(activity.moving_time || 0);
    const elapsedSec = Number(activity.elapsed_time || movingSec || 0);
    const distanceKm = round(distanceM / 1000, 2);
    const minutes = Math.max(1, Math.round(movingSec / 60) || Math.round(elapsedSec / 60) || 1);
    const avgSpeedKmh = movingSec > 0 ? round((distanceM / movingSec) * 3.6, 2) : 0;
    const rawMaxSpeedKmh = round(Number(activity.max_speed || 0) * 3.6, 2);
    const maxSpeedKmh = this.sanitizeMaxSpeedKmh(rawMaxSpeedKmh, avgSpeedKmh, activity.type);
    const paceMinPerKm = distanceKm > 0 ? round(minutes / distanceKm, 2) : null;
    const elevationGainM = round(Number(activity.total_elevation_gain || 0), 1);
    const { avgHeartrate, maxHeartrate } = this.readHeartRate(activity);
    const calories = activity.calories ? round(Number(activity.calories), 0) : null;

    return {
      id: activity.id,
      name: activity.name || 'Run',
      date: this.activityLocalDate(activity),
      type: this.normalizeActivityType(activity.type),
      distanceKm,
      minutes,
      movingSeconds: movingSec,
      elapsedSeconds: elapsedSec,
      avgSpeedKmh,
      maxSpeedKmh,
      rawMaxSpeedKmh: rawMaxSpeedKmh || null,
      paceMinPerKm,
      elevationGainM,
      avgHeartrate,
      maxHeartrate,
      calories,
      shoeId: activity.shoeId ? String(activity.shoeId) : '',
      stravaId: activity.id,
      heartrateZones: Array.isArray(activity.heartrateZones) ? activity.heartrateZones : [],
      paceZones: Array.isArray(activity.paceZones) ? activity.paceZones : [],
      zoneSource: activity.zoneSource || null,
      paceZoneSource: activity.paceZoneSource || null,
      sufferScore: activity.sufferScore || activity.suffer_score || null,
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
        heartRateAvg: null as number | null,
        heartRateMax: null as number | null,
        estimatedSteps: 0,
        _hrWeightMins: 0,
        source: 'strava',
        stravaActivityIds: [] as number[],
        stravaRuns: [] as any[],
      };

      const distKm = round((activity.distance || 0) / 1000, 2);
      const mins = Math.max(0, Math.round((activity.moving_time || 0) / 60) || Math.round((activity.elapsed_time || 0) / 60));
      const activityId = Number(activity.id);
      if (Number.isFinite(activityId) && activityId > 0) current.stravaActivityIds.push(activityId);

      const { avgHeartrate: avgHr, maxHeartrate: maxHr } = this.readHeartRate(activity);
      const hrWeight = Math.max(1, mins || 1);
      if (avgHr) {
        const prevWeight = Number(current._hrWeightMins || 0);
        const prevAvg = Number(current.stravaAvgHeartRate || 0);
        const nextWeight = prevWeight + hrWeight;
        current.stravaAvgHeartRate = nextWeight > 0
          ? Math.round(((prevAvg * prevWeight) + (avgHr * hrWeight)) / nextWeight)
          : avgHr;
        current._hrWeightMins = nextWeight;
        current.heartRateAvg = current.stravaAvgHeartRate;
      }
      if (maxHr) {
        current.stravaMaxHeartRate = Math.max(Number(current.stravaMaxHeartRate || 0), maxHr) || maxHr;
        current.heartRateMax = current.stravaMaxHeartRate;
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
          heartRateAvg: rest.stravaAvgHeartRate || rest.heartRateAvg || null,
          heartRateMax: rest.stravaMaxHeartRate || rest.heartRateMax || null,
        };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  buildRunInsights(activities: any[] = []) {
    const runs = activities
      .filter((activity) => this.normalizeActivityType(activity.type) === 'run')
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
        heartRateZones: [],
        heartRateZoneRuns: 0,
        dominantHeartRateZone: null,
        paceZones: [],
        paceZoneRuns: 0,
        dominantPaceZone: null,
      };
    }

    const totalDistanceKm = round(runs.reduce((sum, run) => sum + run.distanceKm, 0), 2);
    const totalMinutes = runs.reduce((sum, run) => sum + run.minutes, 0);
    const avgPaceMinPerKm = totalDistanceKm > 0 ? round(totalMinutes / totalDistanceKm, 2) : null;
    const avgSpeedKmh = totalMinutes > 0 ? round((totalDistanceKm / totalMinutes) * 60, 2) : null;
    const sanitizedMaxes = runs.map((run) => Number(run.maxSpeedKmh || 0)).filter((value) => value > 0);
    const maxSpeedKmh = sanitizedMaxes.length ? round(Math.max(...sanitizedMaxes), 2) : null;
    const bestPaceRun = [...runs].sort((a, b) => (a.paceMinPerKm || 999) - (b.paceMinPerKm || 999))[0];
    const longestRun = [...runs].sort((a, b) => b.distanceKm - a.distanceKm)[0];
    const elevationGainM = round(runs.reduce((sum, run) => sum + (run.elevationGainM || 0), 0), 1);
    const hrRuns = runs.filter((run) => Number(run.avgHeartrate || 0) > 0);
    const avgHeartRate = hrRuns.length
      ? Math.round(hrRuns.reduce((sum, run) => sum + Number(run.avgHeartrate || 0), 0) / hrRuns.length)
      : null;
    const maxHeartRate = runs.reduce((best, run) => Math.max(best, Number(run.maxHeartrate || 0)), 0) || null;

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

    // Rank by average moving speed (reliable). Raw Strava max_speed is often a GPS spike.
    const qualifiedForSpeed = runs.filter((run) => run.distanceKm >= 2 && Number(run.avgSpeedKmh || 0) > 0);
    const fastestRuns = [...qualifiedForSpeed]
      .sort((a, b) => (b.avgSpeedKmh || 0) - (a.avgSpeedKmh || 0))
      .slice(0, 8)
      .map((run) => ({
        ...run,
        rankSpeedKmh: run.avgSpeedKmh,
        rankSpeedLabel: 'avg',
      }));

    const zoneTotals = new Map<number, any>();
    let zoneSampleCount = 0;
    for (const run of runs) {
      const zones = Array.isArray(run.heartrateZones) ? run.heartrateZones : [];
      if (!zones.length) continue;
      zoneSampleCount += 1;
      zones.forEach((zone: any) => {
        const key = Number(zone.zone || 0);
        if (!zoneTotals.has(key)) {
          zoneTotals.set(key, {
            zone: key,
            label: zone.label || `Z${key}`,
            min: zone.min,
            max: zone.max,
            seconds: 0,
            minutes: 0,
          });
        }
        const current = zoneTotals.get(key);
        current.seconds += Number(zone.seconds || 0);
        if (zone.label) current.label = zone.label;
        if (zone.min != null) current.min = zone.min;
        if (zone.max != null) current.max = zone.max;
      });
    }
    const totalZoneSeconds = [...zoneTotals.values()].reduce((sum, zone) => sum + Number(zone.seconds || 0), 0);
    const heartRateZones = [...zoneTotals.values()]
      .sort((a, b) => a.zone - b.zone)
      .map((zone) => ({
        ...zone,
        minutes: round(Number(zone.seconds || 0) / 60, 1),
        percent: totalZoneSeconds > 0 ? round((Number(zone.seconds || 0) / totalZoneSeconds) * 100, 1) : 0,
      }));
    const dominantZone = [...heartRateZones].sort((a, b) => b.seconds - a.seconds)[0] || null;

    const paceTotals = new Map<number, any>();
    let paceZoneSampleCount = 0;
    for (const run of runs) {
      const zones = Array.isArray(run.paceZones) ? run.paceZones : [];
      if (!zones.length) continue;
      paceZoneSampleCount += 1;
      zones.forEach((zone: any) => {
        const key = Number(zone.zone || 0);
        if (!paceTotals.has(key)) {
          paceTotals.set(key, {
            zone: key,
            label: zone.label || `Z${key}`,
            min: zone.min,
            max: zone.max,
            seconds: 0,
            minutes: 0,
          });
        }
        const current = paceTotals.get(key);
        current.seconds += Number(zone.seconds || 0);
        if (zone.label) current.label = zone.label;
        if (zone.min != null) current.min = zone.min;
        if (zone.max != null) current.max = zone.max;
      });
    }
    const totalPaceSeconds = [...paceTotals.values()].reduce((sum, zone) => sum + Number(zone.seconds || 0), 0);
    const paceZones = [...paceTotals.values()]
      .sort((a, b) => a.zone - b.zone)
      .map((zone) => ({
        ...zone,
        minutes: round(Number(zone.seconds || 0) / 60, 1),
        percent: totalPaceSeconds > 0 ? round((Number(zone.seconds || 0) / totalPaceSeconds) * 100, 1) : 0,
      }));
    const dominantPaceZone = [...paceZones].sort((a, b) => b.seconds - a.seconds)[0] || null;

    return {
      connected: true,
      runCount: runs.length,
      totalDistanceKm,
      totalMinutes,
      avgPaceMinPerKm,
      avgSpeedKmh,
      maxSpeedKmh,
      bestPaceMinPerKm: bestPaceRun?.paceMinPerKm || null,
      bestPaceRun,
      longestRunKm: longestRun?.distanceKm || null,
      longestRun,
      elevationGainM,
      avgHeartRate,
      maxHeartRate,
      recentRuns: runs.slice(0, 12),
      fastestRuns,
      paceByMinuteBuckets,
      heartRateZones,
      heartRateZoneRuns: zoneSampleCount,
      dominantHeartRateZone: dominantZone,
      paceZones,
      paceZoneRuns: paceZoneSampleCount,
      dominantPaceZone,
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
