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
      // Local Node/pg may treat sslmode=require as verify-full; force accept RDS certs.
      options.ssl = { rejectUnauthorized: false };
      options.connectionString = String(DATABASE_URL)
        .replace(/([?&])sslmode=[^&]*/g, '$1')
        .replace(/[?&]$/, '')
        .replace(/\?&/, '?');
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
        CREATE TABLE IF NOT EXISTS wellness_strava_activity_details (
          user_id TEXT NOT NULL,
          activity_id BIGINT NOT NULL,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, activity_id)
        );
      `);
    }

    await this.schemaPromise;
    return this.getPool();
  }

  private tokenPath(userId: string) {
    return path.join(DATA_DIR, `${sanitize(userId)}.json`);
  }

  private detailPath(userId: string, activityId: number) {
    return path.join(DATA_DIR, 'details', sanitize(userId), `${activityId}.json`);
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
    if (!accessToken) {
      throw new Error('Strava token missing or expired. Reconnect Strava in Wellness.');
    }

    const windowDays = Math.max(1, Math.min(1095, Number(days) || 90));
    const after = Math.floor((Date.now() - windowDays * 86400000) / 1000);
    const collected: any[] = [];
    const maxPages = windowDays > 180 ? 40 : windowDays > 90 ? 20 : 8;

    for (let page = 1; page <= maxPages; page += 1) {
      const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50&page=${page}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        const message = await this.formatStravaHttpError(res);
        if (!collected.length) throw new Error(message);
        console.error('Strava activities page failed:', message);
        break;
      }
      const activities = await res.json();
      if (!Array.isArray(activities) || !activities.length) break;
      collected.push(...activities);
      if (activities.length < 50) break;
    }

    if (options.enrichHeartRate !== false) {
      return this.enrichActivitiesWithHeartRate(accessToken, collected);
    }
    return collected;
  }

  private async formatStravaHttpError(res: Response): Promise<string> {
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    const code = String(parsed?.errors?.[0]?.code || '');
    const resource = String(parsed?.errors?.[0]?.resource || '');
    const field = String(parsed?.errors?.[0]?.field || '');
    if (res.status === 403 && /inactive/i.test(code) && /application/i.test(resource)) {
      return 'Strava API app is Inactive. Open strava.com/settings/api, turn the app back on (a Strava subscription is required), then sync again.';
    }
    if (res.status === 403 && /athlete/i.test(`${parsed?.message || ''} ${field} ${code}`)) {
      return 'Strava connected-athlete limit exceeded. Raise it at strava.com/settings/api, then reconnect.';
    }
    return `Strava API error ${res.status}: ${parsed?.message || text.slice(0, 180) || res.statusText}`;
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
      const type = this.activityKind(activity);
      return likelyHr && (type === 'run' || type === 'walk' || type === 'yoga');
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

  private extractStreamSeries(payload: any, type: string): any[] | null {
    if (!payload) return null;
    if (payload?.[type]?.data && Array.isArray(payload[type].data)) return payload[type].data;
    if (Array.isArray(payload)) {
      const match = payload.find((item: any) => String(item?.type || '') === type);
      return Array.isArray(match?.data) ? match.data : null;
    }
    return null;
  }

  private async fetchActivityStreams(
    accessToken: string,
    activityId: number,
    keys = 'time,latlng,distance,heartrate,velocity_smooth,altitude,cadence',
  ): Promise<Record<string, any[]> | null> {
    try {
      const res = await fetch(
        `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${encodeURIComponent(keys)}&key_by_type=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      const payload: any = await res.json();
      const out: Record<string, any[]> = {};
      for (const key of String(keys).split(',')) {
        const series = this.extractStreamSeries(payload, key.trim());
        if (series?.length) out[key.trim()] = series;
      }
      return Object.keys(out).length ? out : null;
    } catch {
      return null;
    }
  }

  private async fetchHeartRateStream(accessToken: string, activityId: number): Promise<number[] | null> {
    const streams = await this.fetchActivityStreams(accessToken, activityId, 'heartrate');
    const series = streams?.heartrate;
    if (!Array.isArray(series)) return null;
    return series.map((value: any) => Number(value)).filter((value: number) => value > 0);
  }

  /** Google encoded polyline → [[lat, lng], ...] */
  private decodePolyline(encoded: string): number[][] {
    if (!encoded || typeof encoded !== 'string') return [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates: number[][] = [];
    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += deltaLat;

      result = 0;
      shift = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += deltaLng;

      coordinates.push([lat / 1e5, lng / 1e5]);
    }
    return coordinates;
  }

  private downsampleSeries<T>(series: T[] = [], maxPoints = 1800): T[] {
    if (!Array.isArray(series) || series.length <= maxPoints) return series || [];
    const step = Math.ceil(series.length / maxPoints);
    const out: T[] = [];
    for (let i = 0; i < series.length; i += step) out.push(series[i]);
    if (out[out.length - 1] !== series[series.length - 1]) out.push(series[series.length - 1]);
    return out;
  }

  private computeKmSplits(streams: Record<string, any[]> = {}) {
    const distance = Array.isArray(streams.distance) ? streams.distance.map((v) => Number(v) || 0) : [];
    const time = Array.isArray(streams.time) ? streams.time.map((v) => Number(v) || 0) : [];
    const heartrate = Array.isArray(streams.heartrate) ? streams.heartrate.map((v) => Number(v) || 0) : [];
    if (distance.length < 2 || time.length < 2) return [];

    const splits: any[] = [];
    const totalM = distance[distance.length - 1] || 0;
    const kmCount = Math.max(1, Math.ceil(totalM / 1000));
    let startIdx = 0;

    for (let km = 1; km <= kmCount; km += 1) {
      const target = Math.min(km * 1000, totalM);
      let endIdx = startIdx;
      while (endIdx < distance.length - 1 && distance[endIdx] < target) endIdx += 1;
      if (km === kmCount) endIdx = distance.length - 1;

      const distM = Math.max(0, (distance[endIdx] || 0) - (distance[startIdx] || 0));
      const sec = Math.max(1, (time[endIdx] || 0) - (time[startIdx] || 0));
      const paceMinPerKm = distM > 0 ? round((sec / 60) / (distM / 1000), 2) : null;
      const speedKmh = sec > 0 ? round((distM / sec) * 3.6, 2) : null;

      let avgHr: number | null = null;
      let maxHr: number | null = null;
      if (heartrate.length > endIdx) {
        const slice = heartrate.slice(startIdx, endIdx + 1).filter((bpm) => bpm > 0);
        if (slice.length) {
          avgHr = Math.round(slice.reduce((sum, bpm) => sum + bpm, 0) / slice.length);
          maxHr = Math.max(...slice);
        }
      }

      splits.push({
        km,
        distanceKm: round(distM / 1000, 2),
        seconds: sec,
        paceMinPerKm,
        speedKmh,
        avgHeartrate: avgHr,
        maxHeartrate: maxHr,
        elevGainM: null,
      });
      startIdx = endIdx;
      if (startIdx >= distance.length - 1) break;
    }
    return splits;
  }

  /** Fastest full-km split from GPS streams (distance ≥ 0.95 km). */
  private pickBestSplit(splits: any[] = []) {
    const full = (splits || []).filter((split) => {
      const distanceKm = Number(split?.distanceKm || 0);
      const pace = Number(split?.paceMinPerKm || 0);
      return distanceKm >= 0.95 && pace > 1.5 && pace < 20;
    });
    if (!full.length) return null;
    const best = [...full].sort((a, b) => Number(a.paceMinPerKm) - Number(b.paceMinPerKm))[0];
    return {
      bestSplitPaceMinPerKm: Number(best.paceMinPerKm),
      bestSplitKm: Number(best.km) || null,
      bestSplitSeconds: Number(best.seconds) || null,
      bestSplitDistanceKm: Number(best.distanceKm) || null,
      bestSplitAvgHeartrate: Number(best.avgHeartrate || 0) || null,
    };
  }

  private readVo2Max(activity: any): number | null {
    const candidates = [
      activity?.vo2_max,
      activity?.vo2max,
      activity?.estimated_vo2_max,
      activity?.estimated_vo2,
      activity?.fitness_score,
      activity?.athlete?.vo2_max,
    ];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 20 && value <= 95) return round(value, 1);
    }
    return null;
  }

  /** Daniels-style estimate from average pace when Strava does not send VO2. */
  private estimateVo2FromPace(paceMinPerKm: number | null): number | null {
    const pace = Number(paceMinPerKm);
    if (!Number.isFinite(pace) || pace < 2.8 || pace > 12) return null;
    const velocityMPerMin = 1000 / pace;
    const vo2 = -4.60 + (0.182258 * velocityMPerMin) + (0.000104 * velocityMPerMin * velocityMPerMin);
    if (!Number.isFinite(vo2) || vo2 < 22 || vo2 > 85) return null;
    return round(vo2, 1);
  }

  private normalizeCadenceSpm(rawValues: number[] = [], detailCadence: number | null = null) {
    const samples = (rawValues || []).map((v) => Number(v) || 0).filter((v) => v > 20);
    let avg = samples.length
      ? samples.reduce((sum, v) => sum + v, 0) / samples.length
      : (detailCadence && detailCadence > 0 ? detailCadence : null);
    if (avg == null) return { avgCadence: null, series: rawValues.map((v) => Number(v) || 0) };
    // Many devices report one-foot cadence (~80–95). Convert to steps/min when clearly half.
    const doubled = avg < 110;
    const factor = doubled ? 2 : 1;
    const series = (rawValues || []).map((v) => {
      const n = Number(v) || 0;
      return n > 20 ? round(n * factor, 1) : 0;
    });
    return { avgCadence: Math.round(avg * factor), series };
  }

  private buildStreamPayload(raw: Record<string, any[]> | null, detail: any = null) {
    if (!raw) return null;
    const time = this.downsampleSeries(raw.time || [], 2400).map((v) => Number(v) || 0);
    const distance = this.downsampleSeries(raw.distance || [], 2400).map((v) => Number(v) || 0);
    const heartrate = this.downsampleSeries(raw.heartrate || [], 2400).map((v) => Number(v) || 0);
    const velocity = this.downsampleSeries(raw.velocity_smooth || [], 2400).map((v) => round((Number(v) || 0) * 3.6, 2));
    const altitude = this.downsampleSeries(raw.altitude || [], 2400).map((v) => round(Number(v) || 0, 1));
    const cadenceRaw = this.downsampleSeries(raw.cadence || [], 2400).map((v) => Number(v) || 0);
    const cadenceNorm = this.normalizeCadenceSpm(cadenceRaw, Number(detail?.average_cadence) || null);
    const cadence = cadenceNorm.series;
    const latlng = this.downsampleSeries(raw.latlng || [], 2400)
      .map((pair: any) => {
        if (Array.isArray(pair) && pair.length >= 2) return [Number(pair[0]), Number(pair[1])];
        return null;
      })
      .filter(Boolean) as number[][];

    const strideLengthM = this.computeStrideSeries(distance, cadence, time);

    return {
      time,
      distance,
      heartrate,
      velocityKmh: velocity,
      altitude,
      cadence,
      strideLengthM,
      latlng,
    };
  }

  /** Approximate stride length (m) from distance change and cadence (spm). */
  private computeStrideSeries(distance: number[] = [], cadence: number[] = [], time: number[] = []) {
    if (!distance.length || !cadence.length) return [];
    const out: number[] = [];
    for (let i = 0; i < distance.length; i += 1) {
      const spm = Number(cadence[i] || 0);
      const dt = i > 0 ? Math.max(0.5, Number(time[i] || i) - Number(time[i - 1] || i - 1)) : 1;
      const dd = i > 0 ? Math.max(0, Number(distance[i] || 0) - Number(distance[i - 1] || 0)) : 0;
      if (spm > 20 && dd > 0) {
        const steps = (spm / 60) * dt;
        out.push(steps > 0 ? round(dd / steps, 3) : 0);
      } else {
        out.push(0);
      }
    }
    return out;
  }

  private summarizeCadenceMetrics(streams: Record<string, any[]> | null, detail: any = {}) {
    const cadenceSrc = streams?.cadence;
    const strideSrc = streams?.strideLengthM;
    const fromStreams = Array.isArray(cadenceSrc) ? cadenceSrc.map((v) => Number(v) || 0).filter((v) => v > 20) : [];
    const stride = Array.isArray(strideSrc) ? strideSrc.map((v) => Number(v) || 0).filter((v) => v > 0.4 && v < 2.5) : [];
    let avgCadence = fromStreams.length
      ? Math.round(fromStreams.reduce((sum, v) => sum + v, 0) / fromStreams.length)
      : null;
    if (!avgCadence) {
      const detailCadence = Number(detail?.average_cadence || 0);
      if (detailCadence > 0) {
        avgCadence = detailCadence < 110 ? Math.round(detailCadence * 2) : Math.round(detailCadence);
      }
    }
    let avgStrideM = stride.length
      ? round(stride.reduce((sum, v) => sum + v, 0) / stride.length, 2)
      : null;
    if (!avgStrideM && avgCadence && Number(detail?.average_speed) > 0) {
      avgStrideM = round(Number(detail.average_speed) / (avgCadence / 60), 2);
    }
    return { avgCadence, avgStrideM };
  }

  /**
   * Zone-weighted fuel split from HR time-in-zone.
   * Lower zones burn more fat; higher zones burn more carbohydrate.
   */
  private computeFuelBurn(heartrateZones: any[] = [], calories: number | null = null) {
    const weights = [
      { fat: 0.85, carb: 0.12, other: 0.03 }, // Z1 recovery / warm-up
      { fat: 0.65, carb: 0.30, other: 0.05 }, // Z2 fat burning
      { fat: 0.45, carb: 0.50, other: 0.05 }, // Z3 aerobic
      { fat: 0.25, carb: 0.70, other: 0.05 }, // Z4 threshold
      { fat: 0.10, carb: 0.85, other: 0.05 }, // Z5 max
    ];
    const totalSec = heartrateZones.reduce((sum, z) => sum + Math.max(0, Number(z.seconds || 0)), 0);
    if (totalSec <= 0) {
      return {
        fatPercent: null,
        carbPercent: null,
        otherPercent: null,
        fatKcal: null,
        carbKcal: null,
        otherKcal: null,
        calories: calories || null,
        note: 'Need heart-rate zones to estimate fuel mix.',
      };
    }
    let fat = 0;
    let carb = 0;
    let other = 0;
    heartrateZones.forEach((zone, index) => {
      const w = weights[Math.min(weights.length - 1, Math.max(0, Number(zone.zone || index + 1) - 1))];
      const share = Math.max(0, Number(zone.seconds || 0)) / totalSec;
      fat += share * w.fat;
      carb += share * w.carb;
      other += share * w.other;
    });
    const fatPercent = Math.round(fat * 100);
    const carbPercent = Math.round(carb * 100);
    const otherPercent = Math.max(0, 100 - fatPercent - carbPercent);
    const kcal = Number(calories) > 0 ? Number(calories) : null;
    return {
      fatPercent,
      carbPercent,
      otherPercent,
      fatKcal: kcal != null ? Math.round(kcal * fatPercent / 100) : null,
      carbKcal: kcal != null ? Math.round(kcal * carbPercent / 100) : null,
      otherKcal: kcal != null ? Math.round(kcal * otherPercent / 100) : null,
      calories: kcal,
      note: 'Estimated from time-in-HR-zone (not lab measured).',
    };
  }

  /** Attach % of duration + average speed while in each HR zone. */
  private enrichZonesWithSpeed(zones: any[] = [], streams: Record<string, any[]> | null = null) {
    const totalSec = zones.reduce((sum, z) => sum + Math.max(0, Number(z.seconds || 0)), 0) || 1;
    const heartrateSrc = streams?.heartrate;
    const velocitySrc = streams?.velocityKmh;
    const heartrate = Array.isArray(heartrateSrc) ? heartrateSrc.map((v) => Number(v) || 0) : [];
    const velocity = Array.isArray(velocitySrc) ? velocitySrc.map((v) => Number(v) || 0) : [];
    const n = Math.min(heartrate.length, velocity.length);

    return zones.map((zone, index) => {
      const seconds = Math.max(0, Number(zone.seconds || 0));
      const percent = round((seconds / totalSec) * 100, 1);
      let avgSpeedKmh: number | null = null;
      if (n > 0) {
        const min = Number(zone.min || 0);
        const maxRaw = zone.max == null || Number(zone.max) < 0 ? Number.POSITIVE_INFINITY : Number(zone.max);
        const isLast = index === zones.length - 1;
        const speeds: number[] = [];
        for (let i = 0; i < n; i += 1) {
          const bpm = heartrate[i];
          if (bpm <= 0) continue;
          const inZone = bpm >= min && (isLast ? bpm <= maxRaw || bpm >= min : bpm < maxRaw);
          if (inZone && velocity[i] > 0) speeds.push(velocity[i]);
        }
        if (speeds.length) {
          avgSpeedKmh = round(speeds.reduce((sum, v) => sum + v, 0) / speeds.length, 2);
        }
      }
      return {
        ...zone,
        percent,
        avgSpeedKmh,
      };
    });
  }

  private async saveActivityDetail(userId: string, activityId: number, payload: any) {
    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      await pool?.query(
        `INSERT INTO wellness_strava_activity_details (user_id, activity_id, payload, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (user_id, activity_id) DO UPDATE
         SET payload = EXCLUDED.payload,
             updated_at = NOW()`,
        [userId, activityId, JSON.stringify(payload)],
      );
      return;
    }
    const fp = this.detailPath(userId, activityId);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(payload), 'utf-8');
  }

  async loadActivityDetail(userId: string, activityId: number): Promise<any | null> {
    let payload: any | null = null;
    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      const result = await pool?.query(
        'SELECT payload FROM wellness_strava_activity_details WHERE user_id = $1 AND activity_id = $2 LIMIT 1',
        [userId, activityId],
      );
      payload = result?.rows?.[0]?.payload || null;
    } else {
      const fp = this.detailPath(userId, activityId);
      if (!fs.existsSync(fp)) return null;
      try {
        payload = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      } catch {
        return null;
      }
    }
    if (!payload) return null;
    const summary = payload.summary || {};
    let next = payload;
    if (!summary.bestSplitPaceMinPerKm) {
      const bestSplit = this.pickBestSplit(payload.splits || []);
      if (bestSplit) {
        next = {
          ...next,
          summary: { ...(next.summary || {}), ...bestSplit },
        };
      }
    }
    const zones = Array.isArray(next.heartrateZones) ? next.heartrateZones : [];
    if (zones.length) {
      const enrichedZones = this.enrichZonesWithSpeed(zones, next.streams || null);
      const fuelBurn = next.fuelBurn
        || next.summary?.fuelBurn
        || this.computeFuelBurn(enrichedZones, next.summary?.calories ?? null);
      next = {
        ...next,
        heartrateZones: enrichedZones,
        fuelBurn,
        summary: {
          ...(next.summary || {}),
          heartrateZones: enrichedZones,
          fuelBurn,
        },
      };
    }
    const currentSummary = next.summary || {};
    if (!currentSummary.avgCadence || !currentSummary.avgStrideM) {
      const cadenceMetrics = this.summarizeCadenceMetrics(next.streams || null, {});
      next = {
        ...next,
        summary: {
          ...currentSummary,
          avgCadence: currentSummary.avgCadence || cadenceMetrics.avgCadence,
          avgStrideM: currentSummary.avgStrideM || cadenceMetrics.avgStrideM,
        },
      };
    }
    if (!next.summary?.vo2Max && next.summary?.paceMinPerKm) {
      const estimated = this.estimateVo2FromPace(next.summary.paceMinPerKm);
      if (estimated) {
        next = {
          ...next,
          summary: {
            ...next.summary,
            vo2Max: estimated,
            vo2Estimated: true,
          },
        };
      }
    }
    return next;
  }

  private async fetchAndBuildActivityDetail(accessToken: string, activityId: number, athleteZones?: any) {
    const [detail, rawStreams] = await Promise.all([
      this.fetchActivityDetail(accessToken, activityId),
      this.fetchActivityStreams(accessToken, activityId),
    ]);

    const streams = this.buildStreamPayload(rawStreams, detail);
    const summaryPolyline = String(detail?.map?.summary_polyline || detail?.map?.polyline || '');
    const latlngFromPolyline = summaryPolyline ? this.decodePolyline(summaryPolyline) : [];
    const latlng = (streams?.latlng?.length ? streams.latlng : latlngFromPolyline) as number[][];

    const boundZones = this.parseAthleteHrZones(athleteZones) || this.defaultHrZoneBounds(
      Number(detail?.max_heartrate || 190),
    );

    let heartrateZones: any[] = [];
    let paceZones: any[] = [];
    let zoneSource: string | null = null;
    let paceZoneSource: string | null = null;
    const zonesPayload = await this.fetchActivityZones(accessToken, activityId);
    const hrZone = Array.isArray(zonesPayload)
      ? zonesPayload.find((item) => String(item?.type || '').toLowerCase() === 'heartrate')
      : null;
    const paceZone = Array.isArray(zonesPayload)
      ? zonesPayload.find((item) => String(item?.type || '').toLowerCase() === 'pace')
      : null;
    if (hrZone?.distribution_buckets?.length) {
      heartrateZones = this.normalizeHrZoneBuckets(hrZone.distribution_buckets, Number(hrZone.max || detail?.max_heartrate || 190));
      zoneSource = 'activity_zones';
    } else if (streams?.heartrate?.length) {
      heartrateZones = this.computeZonesFromStream(
        streams.heartrate.filter((bpm: number) => bpm > 0),
        boundZones,
      );
      zoneSource = 'stream';
    }
    if (paceZone?.distribution_buckets?.length) {
      paceZones = this.normalizePaceZoneBuckets(paceZone.distribution_buckets);
      paceZoneSource = 'activity_zones';
    } else if (streams?.velocityKmh?.length) {
      paceZones = this.computePaceZonesFromVelocity(streams.velocityKmh, streams.time || []);
      paceZoneSource = paceZones.length ? 'stream' : null;
    }

    const splits = this.computeKmSplits({
      distance: streams?.distance || [],
      time: streams?.time || [],
      heartrate: streams?.heartrate || [],
    });

    const paceByMinuteBuckets = this.computePaceByMinuteBucketsFromVelocity(
      streams?.velocityKmh || [],
      streams?.time || [],
    );

    const bestSplit = this.pickBestSplit(splits);
    const vo2FromStrava = this.readVo2Max(detail);
    const summaryBase = this.summarizeRun({
      ...(detail || {}),
      id: activityId,
      heartrateZones,
      paceZones,
      zoneSource,
      paceZoneSource,
    });
    const vo2Max = vo2FromStrava || this.estimateVo2FromPace(summaryBase.paceMinPerKm);
    const cadenceMetrics = this.summarizeCadenceMetrics(streams, detail);
    heartrateZones = this.enrichZonesWithSpeed(heartrateZones, streams);
    const fuelBurn = this.computeFuelBurn(heartrateZones, detail?.calories ? round(Number(detail.calories), 0) : null);
    const startLatlng = Array.isArray(detail?.start_latlng) && detail.start_latlng.length >= 2
      ? [Number(detail.start_latlng[0]), Number(detail.start_latlng[1])]
      : (latlng[0] || null);
    const summary = {
      ...summaryBase,
      ...(bestSplit || {}),
      vo2Max,
      vo2Estimated: !vo2FromStrava && Boolean(vo2Max),
      avgCadence: cadenceMetrics.avgCadence,
      avgStrideM: cadenceMetrics.avgStrideM,
      fuelBurn,
      startLat: startLatlng ? Number(startLatlng[0]) : null,
      startLng: startLatlng ? Number(startLatlng[1]) : null,
      locationCity: detail?.location_city || null,
      locationState: detail?.location_state || null,
    };

    return {
      ok: true,
      activityId,
      fetchedAt: new Date().toISOString(),
      summary,
      polyline: latlng,
      summaryPolyline: summaryPolyline || null,
      streams: streams || {
        time: [],
        distance: [],
        heartrate: [],
        velocityKmh: [],
        altitude: [],
        cadence: [],
        strideLengthM: [],
        latlng: [],
      },
      splits,
      heartrateZones,
      paceZones,
      paceByMinuteBuckets,
      fuelBurn,
      zoneSource,
      paceZoneSource,
      hasMap: latlng.length > 1,
      hasHeartRate: Boolean(streams?.heartrate?.some((bpm: number) => bpm > 0) || summary.avgHeartrate),
      source: 'strava',
    };
  }

  private computePaceZonesFromVelocity(velocityKmh: number[] = [], time: number[] = []) {
    // Fixed recreational pace bands when Strava /zones is unavailable (no Premium needed).
    const bands = [
      { zone: 1, label: 'Z1 Easy (8:00+/km)', maxPace: 999, minPace: 8, seconds: 0 },
      { zone: 2, label: 'Z2 Endurance (7–8)', maxPace: 8, minPace: 7, seconds: 0 },
      { zone: 3, label: 'Z3 Tempo (6–7)', maxPace: 7, minPace: 6, seconds: 0 },
      { zone: 4, label: 'Z4 Threshold (5–6)', maxPace: 6, minPace: 5, seconds: 0 },
      { zone: 5, label: 'Z5 Fast (<5:00)', maxPace: 5, minPace: 0, seconds: 0 },
    ];
    for (let i = 1; i < velocityKmh.length; i += 1) {
      const kmh = Number(velocityKmh[i] || 0);
      if (!(kmh > 0.8)) continue;
      const pace = 60 / kmh;
      const dt = Math.max(1, (Number(time[i]) || i) - (Number(time[i - 1]) || i - 1));
      const band = bands.find((item) => pace >= item.minPace && pace < item.maxPace) || bands[0];
      band.seconds += dt;
    }
    const total = bands.reduce((sum, band) => sum + band.seconds, 0);
    if (!total) return [];
    return bands
      .filter((band) => band.seconds > 0)
      .map((band) => ({
        zone: band.zone,
        label: band.label,
        min: band.minPace,
        max: band.maxPace >= 900 ? null : band.maxPace,
        seconds: band.seconds,
        minutes: round(band.seconds / 60, 1),
        percent: round((band.seconds / total) * 100, 1),
      }))
      .sort((a, b) => a.zone - b.zone);
  }

  private computePaceByMinuteBucketsFromVelocity(velocityKmh: number[] = [], time: number[] = []) {
    const buckets = [
      { label: 'Under 5:00', max: 5, seconds: 0, count: 0 },
      { label: '5:00–6:00', max: 6, seconds: 0, count: 0 },
      { label: '6:00–7:00', max: 7, seconds: 0, count: 0 },
      { label: '7:00–8:00', max: 8, seconds: 0, count: 0 },
      { label: '8:00+', max: 999, seconds: 0, count: 0 },
    ];
    for (let i = 1; i < velocityKmh.length; i += 1) {
      const kmh = Number(velocityKmh[i] || 0);
      if (!(kmh > 0.8)) continue;
      const pace = 60 / kmh;
      const dt = Math.max(1, (Number(time[i]) || i) - (Number(time[i - 1]) || i - 1));
      const bucket = buckets.find((entry) => pace < entry.max) || buckets[buckets.length - 1];
      bucket.seconds += dt;
    }
    const total = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
    return buckets.map((bucket) => ({
      label: bucket.label,
      max: bucket.max,
      seconds: bucket.seconds,
      minutes: round(bucket.seconds / 60, 1),
      // Keep `count` for UI compatibility — for a single run this is minutes in band.
      count: total > 0 ? round(bucket.seconds / 60, 1) : 0,
      percent: total > 0 ? round((bucket.seconds / total) * 100, 1) : 0,
    }));
  }

  private simplifyPolyline(points: number[][] = [], maxPoints = 48): number[][] {
    if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
    const step = Math.ceil(points.length / maxPoints);
    const out: number[][] = [];
    for (let i = 0; i < points.length; i += step) {
      const pair = points[i];
      if (Array.isArray(pair) && pair.length >= 2) out.push([Number(pair[0]), Number(pair[1])]);
    }
    const last = points[points.length - 1];
    if (Array.isArray(last) && out.length) {
      const prev = out[out.length - 1];
      if (prev[0] !== Number(last[0]) || prev[1] !== Number(last[1])) {
        out.push([Number(last[0]), Number(last[1])]);
      }
    }
    return out;
  }

  async listStoredRunSummaries(userId: string, options: { days?: number; limit?: number } = {}) {
    const limit = Math.max(1, Math.min(80, Number(options.limit) || 40));
    const windowDays = Math.max(1, Math.min(1095, Number(options.days) || 180));
    const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
    const summaries: any[] = [];

    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      const result = await pool?.query(
        `SELECT activity_id, payload
         FROM wellness_strava_activity_details
         WHERE user_id = $1
         ORDER BY COALESCE((payload->'summary'->>'date'), '') DESC, updated_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      for (const row of result?.rows || []) {
        const payload = row.payload || {};
        const summary = payload.summary || {};
        const date = String(summary.date || '').slice(0, 10);
        if (date && date < cutoff) continue;
        const bestSplit = summary.bestSplitPaceMinPerKm
          ? {
              bestSplitPaceMinPerKm: Number(summary.bestSplitPaceMinPerKm),
              bestSplitKm: Number(summary.bestSplitKm || 0) || null,
              bestSplitSeconds: Number(summary.bestSplitSeconds || 0) || null,
              bestSplitDistanceKm: Number(summary.bestSplitDistanceKm || 0) || null,
              bestSplitAvgHeartrate: Number(summary.bestSplitAvgHeartrate || 0) || null,
            }
          : this.pickBestSplit(payload.splits || []);
        summaries.push({
          ...summary,
          ...(bestSplit || {}),
          vo2Max: Number(summary.vo2Max || 0) || null,
          id: Number(row.activity_id),
          stravaId: Number(row.activity_id),
          heartrateZones: payload.heartrateZones || summary.heartrateZones || [],
          paceZones: payload.paceZones || summary.paceZones || [],
          zoneSource: payload.zoneSource || summary.zoneSource || null,
          paceZoneSource: payload.paceZoneSource || summary.paceZoneSource || null,
        });
      }
      return summaries;
    }

    const cards = await this.listActivityMapCards(userId, { limit });
    return (cards.cards || [])
      .map((card: any) => ({
        ...(card.summary || {}),
        id: card.activityId,
        stravaId: card.activityId,
      }))
      .filter((run: any) => {
        const date = String(run.date || '').slice(0, 10);
        return !date || date >= cutoff;
      });
  }

  async listActivityMapCards(userId: string, options: { limit?: number } = {}) {
    const limit = Math.max(1, Math.min(80, Number(options.limit) || 12));
    const cards: any[] = [];

    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      const result = await pool?.query(
        `SELECT activity_id, payload
         FROM wellness_strava_activity_details
         WHERE user_id = $1
         ORDER BY
           CASE WHEN COALESCE((payload->'summary'->>'distanceKm')::float, 0) >= 0.3 THEN 0 ELSE 1 END,
           COALESCE((payload->'summary'->>'date'), '') DESC,
           updated_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      for (const row of result?.rows || []) {
        const payload = row.payload || {};
        const polyline = this.simplifyPolyline(
          Array.isArray(payload.polyline) && payload.polyline.length
            ? payload.polyline
            : (payload.streams?.latlng || []),
          56,
        );
        cards.push({
          activityId: Number(row.activity_id),
          summary: payload.summary || null,
          polyline,
          hasMap: polyline.length > 1,
          splits: Array.isArray(payload.splits) ? payload.splits.length : 0,
          hasHeartRate: Boolean(payload.hasHeartRate),
        });
      }
      return { cards, count: cards.length };
    }

    const dir = path.join(DATA_DIR, 'details', sanitize(userId));
    if (!fs.existsSync(dir)) return { cards: [], count: 0 };
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).slice(0, limit * 2);
    for (const file of files) {
      try {
        const payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        const polyline = this.simplifyPolyline(
          Array.isArray(payload.polyline) && payload.polyline.length
            ? payload.polyline
            : (payload.streams?.latlng || []),
          56,
        );
        cards.push({
          activityId: Number(payload.activityId || String(file).replace(/\.json$/, '')),
          summary: payload.summary || null,
          polyline,
          hasMap: polyline.length > 1,
          splits: Array.isArray(payload.splits) ? payload.splits.length : 0,
          hasHeartRate: Boolean(payload.hasHeartRate),
        });
      } catch {
        /* ignore */
      }
    }
    cards.sort((a, b) => String(b.summary?.date || '').localeCompare(String(a.summary?.date || '')));
    return { cards: cards.slice(0, limit), count: Math.min(cards.length, limit) };
  }

  async getActivityDetail(userId: string, activityId: number, options: { force?: boolean } = {}) {
    const id = Number(activityId);
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false, error: 'invalid_activity', activityId };
    }

    const cached = await this.loadActivityDetail(userId, id);
    const hasUsableCache = cached?.ok !== false && (
      (Array.isArray(cached?.polyline) && cached.polyline.length > 1)
      || (Array.isArray(cached?.streams?.heartrate) && cached.streams.heartrate.length > 0)
      || (Array.isArray(cached?.splits) && cached.splits.length > 0)
    );

    if (hasUsableCache && !options.force) {
      const patched = { ...cached, ok: true, cached: true, activityId: id };
      if (!(Array.isArray(patched.paceByMinuteBuckets) && patched.paceByMinuteBuckets.length)
        && Array.isArray(patched.streams?.velocityKmh)
        && patched.streams.velocityKmh.length) {
        patched.paceByMinuteBuckets = this.computePaceByMinuteBucketsFromVelocity(
          patched.streams.velocityKmh,
          patched.streams.time || [],
        );
      }
      if (!(Array.isArray(patched.paceZones) && patched.paceZones.length)
        && Array.isArray(patched.streams?.velocityKmh)
        && patched.streams.velocityKmh.length) {
        patched.paceZones = this.computePaceZonesFromVelocity(
          patched.streams.velocityKmh,
          patched.streams.time || [],
        );
        patched.paceZoneSource = patched.paceZoneSource || 'stream';
      }
      return patched;
    }

    const accessToken = await this.refreshIfNeeded(userId);
    if (!accessToken) {
      if (cached) return { ...cached, ok: true, cached: true, offline: true, activityId: id };
      return { ok: false, error: 'not_connected', activityId: id };
    }

    try {
      const athleteZones = await this.fetchAthleteZones(accessToken);
      const built = await this.fetchAndBuildActivityDetail(accessToken, id, athleteZones);
      await this.saveActivityDetail(userId, id, built);
      return { ...built, cached: false };
    } catch (err) {
      console.error('Strava activity detail fetch failed:', err);
      if (cached) return { ...cached, ok: true, cached: true, stale: true, activityId: id };
      return { ok: false, error: 'fetch_failed', activityId: id };
    }
  }

  async enrichRecentActivityDetails(
    userId: string,
    activityIds: number[] = [],
    options: { maxActivities?: number } = {},
  ) {
    const accessToken = await this.refreshIfNeeded(userId);
    if (!accessToken) return { enriched: 0, skipped: activityIds.length, connected: false };

    const limit = Math.max(1, Math.min(25, Number(options.maxActivities) || 8));
    const uniqueIds = [...new Set(activityIds.map((id) => Number(id)).filter((id) => id > 0))];
    let enriched = 0;
    let skipped = 0;
    let scanned = 0;
    const athleteZones = await this.fetchAthleteZones(accessToken);

    // Prefer newest unenriched IDs — do not burn the quota on already-mapped runs.
    for (const id of uniqueIds) {
      if (enriched >= limit) break;
      scanned += 1;
      const existing = await this.loadActivityDetail(userId, id);
      if (
        existing
        && ((Array.isArray(existing.polyline) && existing.polyline.length > 1)
          || (Array.isArray(existing.streams?.latlng) && existing.streams.latlng.length > 1)
          || (Array.isArray(existing.splits) && existing.splits.length > 0))
      ) {
        skipped += 1;
        continue;
      }
      try {
        const built = await this.fetchAndBuildActivityDetail(accessToken, id, athleteZones);
        await this.saveActivityDetail(userId, id, built);
        enriched += 1;
      } catch (err) {
        console.error(`Detail enrich failed for ${id}:`, err);
      }
    }

    return { enriched, skipped, connected: true, attempted: scanned, filled: enriched };
  }

  async deleteActivityDetail(userId: string, activityId: number) {
    const id = Number(activityId);
    if (!Number.isFinite(id) || id <= 0) return { ok: false };
    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      await pool?.query(
        'DELETE FROM wellness_strava_activity_details WHERE user_id = $1 AND activity_id = $2',
        [userId, id],
      );
      return { ok: true };
    }
    const fp = this.detailPath(userId, id);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return { ok: true };
  }

  private defaultHrZoneBounds(maxHr = 190) {
    const ceiling = Math.max(140, Math.min(230, Number(maxHr) || 190));
    // Classic 5-zone % of max HR with coaching names
    return [
      { zone: 1, label: 'Z1 Recovery', min: 0, max: Math.round(ceiling * 0.6) },
      { zone: 2, label: 'Z2 Fat Burning', min: Math.round(ceiling * 0.6), max: Math.round(ceiling * 0.7) },
      { zone: 3, label: 'Z3 Aerobic', min: Math.round(ceiling * 0.7), max: Math.round(ceiling * 0.8) },
      { zone: 4, label: 'Z4 Threshold', min: Math.round(ceiling * 0.8), max: Math.round(ceiling * 0.9) },
      { zone: 5, label: 'Z5 Max Effort', min: Math.round(ceiling * 0.9), max: ceiling + 1 },
    ];
  }

  private parseAthleteHrZones(athleteZones: any) {
    const heart = athleteZones?.heart_rate || athleteZones?.heartrate || null;
    const zones = Array.isArray(heart?.zones) ? heart.zones : null;
    if (!zones?.length) return null;
    return zones.map((zone: any, index: number) => ({
      zone: index + 1,
      label: this.zoneName(index),
      min: Number(zone.min || zone.min_hr || 0),
      max: Number(zone.max || zone.max_hr || -1),
    }));
  }

  private zoneName(index: number) {
    const labels = [
      'Z1 Recovery',
      'Z2 Fat Burning',
      'Z3 Aerobic',
      'Z4 Threshold',
      'Z5 Max Effort',
      'Z6+',
      'Z7',
    ];
    return labels[index] || `Z${index + 1}`;
  }

  private zoneLabel(index: number, min: number, max: number) {
    const range = max > 0 ? `${min}–${max} bpm` : `${min}+ bpm`;
    return `${this.zoneName(index)} (${range})`;
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
      .filter((activity) => this.activityKind(activity) === 'run')
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
    const normalized = String(type || '').toLowerCase().replace(/[\s_-]/g, '');
    if (normalized === 'trailrun' || normalized === 'virtualrun') return 'run';
    if (normalized === 'hike' || normalized === 'snowshoe' || normalized === 'stairstepper') return 'walk';
    return normalized;
  }

  private activitySportRaw(activity: any): string {
    return String(activity?.sport_type || activity?.type || activity?.sportType || '');
  }

  /** Prefer Strava sport_type; type is deprecated and often missing on imported walks. */
  activityKind(activity: any): string {
    const sport = this.normalizeActivityType(this.activitySportRaw(activity));
    const name = String(activity?.name || '');
    if (sport === 'yoga' || (sport === 'workout' && /yoga|asan/i.test(name))) return 'yoga';
    if (sport === 'walk') return 'walk';
    if (sport === 'run') {
      if (this.looksLikeWalkName(name)) return 'walk';
      return 'run';
    }
    if ((sport === 'workout' || sport === 'cardio') && this.looksLikeWalkName(name)) return 'walk';
    return sport;
  }

  private looksLikeWalkName(name: string): boolean {
    if (!name) return false;
    if (/run|jog|tempo|interval|repeat|fartlek|stride/i.test(name)) return false;
    return /walk|stroll|\bhike\b|rambl/i.test(name);
  }

  private isYogaActivity(activity: any): boolean {
    return this.activityKind(activity) === 'yoga';
  }

  collectKnownActivityIds(entries: any[] = []): Set<number> {
    return this.collectStoredActivityIds(entries).all;
  }

  collectStoredActivityIds(entries: any[] = []): {
    all: Set<number>;
    runs: Set<number>;
    walks: Set<number>;
    yoga: Set<number>;
  } {
    const all = new Set<number>();
    const runs = new Set<number>();
    const walks = new Set<number>();
    const yoga = new Set<number>();
    const add = (set: Set<number>, value: any) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        set.add(numeric);
        all.add(numeric);
      }
    };
    for (const entry of entries) {
      for (const id of entry?.stravaActivityIds || []) add(all, id);
      for (const item of entry?.stravaRuns || []) add(runs, item?.id || item?.stravaId);
      for (const item of entry?.stravaWalks || []) add(walks, item?.id || item?.stravaId);
      for (const item of entry?.stravaYoga || []) add(yoga, item?.id || item?.stravaId);
    }
    return { all, runs, walks, yoga };
  }

  filterNewActivities(
    activities: any[] = [],
    stored: { all: Set<number>; runs: Set<number>; walks: Set<number>; yoga: Set<number> } | Set<number>,
    deletedIds: Set<number> = new Set(),
  ) {
    const buckets = stored instanceof Set
      ? { all: stored, runs: stored, walks: stored, yoga: stored }
      : stored;
    const newActivities = activities.filter((activity) => {
      const id = Number(activity?.id);
      if (!Number.isFinite(id) || id <= 0) return false;
      if (deletedIds.has(id)) return false;
      const kind = this.activityKind(activity);
      if (kind === 'walk') return !buckets.walks.has(id);
      if (kind === 'yoga') return !buckets.yoga.has(id);
      if (kind === 'run') return !buckets.runs.has(id);
      return !buckets.all.has(id);
    });
    return {
      newActivities,
      skipped: Math.max(0, activities.length - newActivities.length),
    };
  }

  async enrichActivitiesHeartRateForUser(userId: string, activities: any[] = []): Promise<any[]> {
    const accessToken = await this.refreshIfNeeded(userId);
    if (!accessToken) return activities;
    return this.enrichActivitiesWithHeartRate(accessToken, activities);
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
    const maxSpeedKmh = this.sanitizeMaxSpeedKmh(rawMaxSpeedKmh, avgSpeedKmh, this.activityKind(activity));
    const paceMinPerKm = distanceKm > 0 ? round(minutes / distanceKm, 2) : null;
    const elevationGainM = round(Number(activity.total_elevation_gain || 0), 1);
    const { avgHeartrate, maxHeartrate } = this.readHeartRate(activity);
    const calories = activity.calories ? round(Number(activity.calories), 0) : null;

    const type = this.activityKind(activity);
    const fallbackName = type === 'walk' ? 'Walk' : type === 'yoga' ? 'Yoga' : 'Run';

    return {
      id: activity.id,
      name: activity.name || fallbackName,
      date: this.activityLocalDate(activity),
      type,
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
      bestSplitPaceMinPerKm: Number(activity.bestSplitPaceMinPerKm || 0) || null,
      bestSplitKm: Number(activity.bestSplitKm || 0) || null,
      bestSplitSeconds: Number(activity.bestSplitSeconds || 0) || null,
      bestSplitDistanceKm: Number(activity.bestSplitDistanceKm || 0) || null,
      bestSplitAvgHeartrate: Number(activity.bestSplitAvgHeartrate || 0) || null,
      vo2Max: Number(activity.vo2Max || activity.vo2_max || 0) || null,
      avgCadence: Number(activity.avgCadence || activity.average_cadence || 0) || null,
      avgStrideM: Number(activity.avgStrideM || 0) || null,
      fuelBurn: activity.fuelBurn || null,
    };
  }

  mapToWellnessFields(activities: any[]): Record<string, number> {
    const fields: Record<string, number> = {};

    for (const a of activities) {
      const type = this.activityKind(a);
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
        if (this.isYogaActivity(a)) {
          fields.yogaMinutes = (fields.yogaMinutes || 0) + mins;
        } else {
          fields.exerciseMinutes = (fields.exerciseMinutes || 0) + mins;
        }
      } else if (type === 'yoga') {
        fields.yogaMinutes = (fields.yogaMinutes || 0) + mins;
      }
    }
    return fields;
  }

  buildWellnessEntriesFromActivities(activities: any[] = []) {
    const byDate = new Map<string, any>();

    for (const activity of activities) {
      const type = this.activityKind(activity);
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
        stravaWalks: [] as any[],
        stravaYoga: [] as any[],
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
        current.stravaWalks.push(this.summarizeRun(activity));
      } else if (type === 'swim') {
        current.swimmingMinutes += mins;
      } else if (type === 'ride' || type === 'virtualride') {
        current.cyclingDistanceKm = round(current.cyclingDistanceKm + distKm, 2);
        current.cyclingMinutes += mins;
      } else if (type === 'workout' || type === 'weighttraining' || type === 'crossfit') {
        if (this.isYogaActivity(activity)) {
          current.yogaMinutes += mins;
          current.stravaYoga.push(this.summarizeRun({ ...activity, type: 'Yoga' }));
        } else {
          current.exerciseMinutes += mins;
        }
      } else if (type === 'yoga') {
        current.yogaMinutes += mins;
        current.stravaYoga.push(this.summarizeRun(activity));
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
      .filter((activity) => this.activityKind(activity) === 'run')
      .map((activity) => this.summarizeRun(activity))
      .filter((run) => run.distanceKm > 0 && run.minutes > 0)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return this.aggregateRunInsights(runs);
  }

  /** Insights from Cosmix-stored run summaries (no live Strava required). */
  buildRunInsightsFromSummaries(summaries: any[] = []) {
    const runs = (summaries || [])
      .map((run) => ({
        id: run.id || run.stravaId,
        stravaId: run.stravaId || run.id,
        name: run.name || 'Run',
        date: run.date,
        type: 'run',
        distanceKm: Number(run.distanceKm || 0),
        minutes: Number(run.minutes || 0),
        movingSeconds: Number(run.movingSeconds || (Number(run.minutes || 0) * 60) || 0),
        elapsedSeconds: Number(run.elapsedSeconds || 0),
        avgSpeedKmh: Number(run.avgSpeedKmh || 0),
        maxSpeedKmh: Number(run.maxSpeedKmh || 0) || null,
        paceMinPerKm: Number(run.paceMinPerKm || 0) || null,
        elevationGainM: Number(run.elevationGainM || 0),
        avgHeartrate: Number(run.avgHeartrate || 0) || null,
        maxHeartrate: Number(run.maxHeartrate || 0) || null,
        heartrateZones: Array.isArray(run.heartrateZones) ? run.heartrateZones : [],
        paceZones: Array.isArray(run.paceZones) ? run.paceZones : [],
        zoneSource: run.zoneSource || null,
        paceZoneSource: run.paceZoneSource || null,
        bestSplitPaceMinPerKm: Number(run.bestSplitPaceMinPerKm || 0) || null,
        bestSplitKm: Number(run.bestSplitKm || 0) || null,
        bestSplitSeconds: Number(run.bestSplitSeconds || 0) || null,
        bestSplitDistanceKm: Number(run.bestSplitDistanceKm || 0) || null,
        bestSplitAvgHeartrate: Number(run.bestSplitAvgHeartrate || 0) || null,
        vo2Max: Number(run.vo2Max || 0) || null,
      }))
      .filter((run) => run.distanceKm > 0 && run.minutes > 0)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return this.aggregateRunInsights(runs);
  }

  async loadActivityDetailsByIds(userId: string, activityIds: number[] = []) {
    const ids = [...new Set(activityIds.map((id) => Number(id)).filter((id) => id > 0))];
    if (!ids.length) return new Map<number, any>();
    const map = new Map<number, any>();

    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      const result = await pool?.query(
        `SELECT activity_id, payload
         FROM wellness_strava_activity_details
         WHERE user_id = $1 AND activity_id = ANY($2::bigint[])`,
        [userId, ids],
      );
      for (const row of result?.rows || []) {
        map.set(Number(row.activity_id), row.payload);
      }
      return map;
    }

    for (const id of ids) {
      const detail = await this.loadActivityDetail(userId, id);
      if (detail) map.set(id, detail);
    }
    return map;
  }

  async attachStoredDetailFields(userId: string, summaries: any[] = [], options: { maxLookups?: number } = {}) {
    const maxLookups = Math.max(1, Math.min(40, Number(options.maxLookups) || 20));
    const candidates = [];
    for (const run of summaries || []) {
      const id = Number(run?.stravaId || run?.id || 0);
      const needsZones = !(Array.isArray(run?.heartrateZones) && run.heartrateZones.length)
        || !(Array.isArray(run?.paceZones) && run.paceZones.length);
      const needsBestSplit = !Number(run?.bestSplitPaceMinPerKm || 0);
      if (id && (needsZones || needsBestSplit) && candidates.length < maxLookups) candidates.push(id);
    }
    const detailsById = await this.loadActivityDetailsByIds(userId, candidates);

    return (summaries || []).map((run) => {
      const id = Number(run?.stravaId || run?.id || 0);
      const detail = id ? detailsById.get(id) : null;
      if (!detail) return run;
      const bestSplit = detail.summary?.bestSplitPaceMinPerKm
        ? {
            bestSplitPaceMinPerKm: detail.summary.bestSplitPaceMinPerKm,
            bestSplitKm: detail.summary.bestSplitKm,
            bestSplitSeconds: detail.summary.bestSplitSeconds,
            bestSplitDistanceKm: detail.summary.bestSplitDistanceKm,
            bestSplitAvgHeartrate: detail.summary.bestSplitAvgHeartrate,
          }
        : this.pickBestSplit(detail.splits || []);
      return {
        ...run,
        heartrateZones: (Array.isArray(run.heartrateZones) && run.heartrateZones.length)
          ? run.heartrateZones
          : (detail.heartrateZones || []),
        paceZones: (Array.isArray(run.paceZones) && run.paceZones.length)
          ? run.paceZones
          : (detail.paceZones || []),
        zoneSource: run.zoneSource || detail.zoneSource || null,
        paceZoneSource: run.paceZoneSource || detail.paceZoneSource || null,
        avgHeartrate: run.avgHeartrate || detail.summary?.avgHeartrate || null,
        maxHeartrate: run.maxHeartrate || detail.summary?.maxHeartrate || null,
        bestSplitPaceMinPerKm: run.bestSplitPaceMinPerKm || bestSplit?.bestSplitPaceMinPerKm || null,
        bestSplitKm: run.bestSplitKm || bestSplit?.bestSplitKm || null,
        bestSplitSeconds: run.bestSplitSeconds || bestSplit?.bestSplitSeconds || null,
        bestSplitDistanceKm: run.bestSplitDistanceKm || bestSplit?.bestSplitDistanceKm || null,
        bestSplitAvgHeartrate: run.bestSplitAvgHeartrate || bestSplit?.bestSplitAvgHeartrate || null,
        vo2Max: run.vo2Max || detail.summary?.vo2Max || null,
      };
    });
  }

  private aggregateRunInsights(runs: any[] = []) {
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
        bestSplitPaceMinPerKm: null,
        bestSplitRun: null,
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
    const bestSplitRun = [...runs]
      .filter((run) => Number(run.bestSplitPaceMinPerKm || 0) > 0)
      .sort((a, b) => Number(a.bestSplitPaceMinPerKm) - Number(b.bestSplitPaceMinPerKm))[0] || null;
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
      bestSplitPaceMinPerKm: bestSplitRun?.bestSplitPaceMinPerKm || null,
      bestSplitRun,
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
