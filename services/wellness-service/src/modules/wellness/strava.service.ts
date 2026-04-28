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

  private getPool() {
    if (!this.hasDatabase()) return null;
    if (!this.pool) {
      this.pool = new Pool({ connectionString: DATABASE_URL });
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
      scope: 'activity:read',
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
      console.log('Strava token exchange request:', JSON.stringify({ ...body, client_secret: '***' }));
      const res = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: any = await res.json();
      console.log('Strava token exchange response:', res.status, JSON.stringify(data?.errors || data?.message || 'ok'));
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

    // Still valid (with 60s buffer)
    if (tokens.expires_at > Math.floor(Date.now() / 1000) + 60) {
      return tokens.access_token;
    }

    // Refresh
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
    const accessToken = await this.refreshIfNeeded(userId);
    if (!accessToken) return [];

    // "after" = start of today UTC
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const after = Math.floor(startOfDay.getTime() / 1000);

    try {
      const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=30`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return [];
      const activities = await res.json();
      return Array.isArray(activities) ? activities : [];
    } catch {
      return [];
    }
  }

  /** Map Strava activities into wellness form fields */
  mapToWellnessFields(activities: any[]): Record<string, number> {
    const fields: Record<string, number> = {};

    for (const a of activities) {
      const type = (a.type || '').toLowerCase();
      const distKm = +(((a.distance || 0) / 1000).toFixed(2));
      const mins = Math.round((a.moving_time || 0) / 60);

      if (type === 'run') {
        fields.runningDistanceKm = +(((fields.runningDistanceKm || 0) + distKm).toFixed(2));
        fields.runningMinutes = (fields.runningMinutes || 0) + mins;
      } else if (type === 'walk') {
        fields.walkingDistanceKm = +(((fields.walkingDistanceKm || 0) + distKm).toFixed(2));
        fields.walkingMinutes = (fields.walkingMinutes || 0) + mins;
      } else if (type === 'swim') {
        fields.swimmingMinutes = (fields.swimmingMinutes || 0) + mins;
      } else if (type === 'ride' || type === 'virtualride') {
        fields.cyclingDistanceKm = +(((fields.cyclingDistanceKm || 0) + distKm).toFixed(2));
        fields.cyclingMinutes = (fields.cyclingMinutes || 0) + mins;
      } else if (type === 'workout' || type === 'weighttraining' || type === 'crossfit') {
        fields.exerciseMinutes = (fields.exerciseMinutes || 0) + mins;
      }
    }
    return fields;
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
