import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeEntryScores,
  DEFAULT_SCORING_RULES,
  normalizeScoringRules,
  roundScore,
  WellnessScoringRules,
} from './wellness-scoring';

const { Pool } = require('pg');

const DATA_DIR = path.join(process.cwd(), 'data', 'wellness');
const SCORING_RULES_FILE = path.join(DATA_DIR, 'scoring-rules.json');
const DATABASE_URL = process.env.DATABASE_URL || '';

type WellnessPlanStatus = 'active' | 'inactive';
type WellnessEntryStatus = 'active' | 'inactive';

type WellnessEntry = Record<string, any> & {
  date: string;
  planId?: string | null;
  status?: WellnessEntryStatus;
  createdAt?: string;
  updatedAt?: string;
};

type WellnessPlanRecord = {
  id: string;
  name: string;
  startDate: string;
  startedAt: string;
  updatedAt?: string;
  endedAt?: string | null;
  status: WellnessPlanStatus;
  finalTotals?: { physical: number; mental: number; total: number; days: number } | null;
};

type WellnessPlan = WellnessPlanRecord | null;

type WellnessDailyScore = {
  date: string;
  source: 'entry' | 'auto';
  physicalScore: number;
  mentalScore: number;
  totalScore: number;
  cumulativePhysicalScore: number;
  cumulativeMentalScore: number;
  cumulativeTotalScore: number;
  workoutMinutes: number;
};

type WellnessPlanTransaction = {
  date: string;
  activityName: string;
  source: 'daily-drain' | 'activity';
  detail: string;
  sortOrder: number;
};

type WellnessActivityEntryRow = {
  planId: string | null;
  date: string;
  activityKey: string;
  activityLabel: string;
  unit: string;
  value: number;
  source: 'entry' | 'default';
  physicalContribution: number;
  mentalContribution: number;
  totalContribution: number;
};

type WellnessTablesReadyResult = {
  dailyScoresReady: boolean;
};

type WellnessDerivedCache = {
  computedOnDate: string;
  planId: string | null;
  rulesHash: string;
  entriesHash: string;
  dailyScores: WellnessDailyScore[];
  planTransactions: WellnessPlanTransaction[];
};

type WellnessStoredState = {
  entries: WellnessEntry[];
  form: Record<string, any> | null;
  plans: WellnessPlanRecord[];
  derived?: WellnessDerivedCache | null;
  updatedAt?: string;
};

type WellnessState = {
  entries: WellnessEntry[];
  form: Record<string, any> | null;
  plan: WellnessPlan;
  plans: WellnessPlanRecord[];
  dailyScores: WellnessDailyScore[];
  planTransactions: WellnessPlanTransaction[];
};

function sanitizeUserId(userId: string): string {
  return String(userId || 'default').replace(/[^a-zA-Z0-9_@.\-]/g, '_').slice(0, 120);
}

function buildPlanName(startDate: string): string {
  const normalized = String(startDate || '').slice(0, 10);
  const [year, month, day] = normalized.split('-');
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthLabel = monthNames[Math.max(0, Number(month || 1) - 1)] || 'jan';
  const dayNumber = Number(day || 1);
  return `cosmix${dayNumber}${monthLabel}${String(year || '').slice(-2)}`;
}

function formatMetric(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(1)));
}

function buildPlanId(startDate: string, startedAt: string) {
  const safeDate = String(startDate || '').slice(0, 10).replace(/[^0-9]/g, '');
  const safeTs = String(startedAt || '').replace(/[^0-9]/g, '').slice(-12);
  return `plan-${safeDate || '00000000'}-${safeTs || Date.now()}`;
}

function safeJsonHash(input: unknown) {
  try {
    return JSON.stringify(input);
  } catch {
    return String(input || '');
  }
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeRuleContribution(value: number, multiplier: number, divisor: number) {
  if (!multiplier || !Number.isFinite(value)) return 0;
  return (value / Math.max(1, divisor)) * multiplier;
}

@Injectable()
export class WellnessStorageService {
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
      this.schemaPromise = (async () => {
        await pool?.query(`
          CREATE TABLE IF NOT EXISTS wellness_settings (
            setting_key TEXT PRIMARY KEY,
            payload JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS wellness_user_plans (
            plan_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            start_date DATE NOT NULL,
            started_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ,
            status TEXT NOT NULL,
            final_totals JSONB,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_wellness_user_plans_user_start
            ON wellness_user_plans(user_id, start_date DESC);

          CREATE TABLE IF NOT EXISTS wellness_user_activity_transactions (
            transaction_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_id TEXT,
            entry_date DATE NOT NULL,
            status TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_wellness_user_activity_transactions_user_date
            ON wellness_user_activity_transactions(user_id, entry_date DESC);

          CREATE TABLE IF NOT EXISTS wellness_plan_transactions (
            transaction_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_id TEXT,
            entry_date DATE NOT NULL,
            activity_name TEXT NOT NULL,
            source TEXT NOT NULL,
            detail TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_wellness_plan_transactions_user_date
            ON wellness_plan_transactions(user_id, entry_date DESC);

          CREATE TABLE IF NOT EXISTS wellness_daily_scores (
            score_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            plan_id TEXT,
            score_date DATE NOT NULL,
            source TEXT NOT NULL,
            physical_score DOUBLE PRECISION NOT NULL DEFAULT 0,
            mental_score DOUBLE PRECISION NOT NULL DEFAULT 0,
            total_score DOUBLE PRECISION NOT NULL DEFAULT 0,
            cumulative_physical_score DOUBLE PRECISION NOT NULL DEFAULT 0,
            cumulative_mental_score DOUBLE PRECISION NOT NULL DEFAULT 0,
            cumulative_total_score DOUBLE PRECISION NOT NULL DEFAULT 0,
            workout_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_wellness_daily_scores_user_date
            ON wellness_daily_scores(user_id, score_date DESC);

          CREATE INDEX IF NOT EXISTS idx_wellness_daily_scores_user_plan
            ON wellness_daily_scores(user_id, plan_id);

          CREATE UNIQUE INDEX IF NOT EXISTS uq_wellness_daily_scores_user_plan_date
            ON wellness_daily_scores(user_id, COALESCE(plan_id, ''), score_date);

          CREATE INDEX IF NOT EXISTS idx_wellness_daily_scores_user_total_desc
            ON wellness_daily_scores(user_id, total_score DESC, score_date DESC);
        `);
      })();
    }
    await this.schemaPromise;
    return this.getPool();
  }

  private parseIsoDateTime(value: unknown, fallback: string) {
    if (!value) return fallback;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toISOString();
  }

  private buildDeterministicId(parts: Array<string | number | null | undefined>) {
    return parts
      .map((part) => String(part ?? ''))
      .join(':')
      .replace(/[^a-zA-Z0-9_.:@\-]/g, '_')
      .slice(0, 250);
  }

  private async syncNormalizedTablesForUser(
    pool: any,
    userId: string,
    normalizedStore: WellnessStoredState,
    scoringRules: WellnessScoringRules,
  ) {
    const preparedStore = this.normalizeStore(normalizedStore);
    const now = this.nowIso();

    const planDerivations = preparedStore.plans.map((plan) => {
      const planEntries = this.sortEntries(preparedStore.entries.filter((entry) => entry.planId === plan.id));
      const endDate = plan.status === 'inactive' && plan.endedAt
        ? this.normalizeDate(plan.endedAt)
        : this.normalizeDate();
      const dailyScores = this.buildDailyScoresForRange(planEntries, plan.startDate, endDate, scoringRules);
      const planTransactions = this.buildPlanTransactions(planEntries, plan, scoringRules, dailyScores, endDate);
      return {
        plan,
        entries: planEntries,
        endDate,
        dailyScores,
        planTransactions,
      };
    });

    await pool.query('DELETE FROM wellness_user_plans WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wellness_user_activity_transactions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wellness_plan_transactions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM wellness_daily_scores WHERE user_id = $1', [userId]);

    for (const plan of preparedStore.plans) {
      await pool.query(
        `INSERT INTO wellness_user_plans (
           plan_id, user_id, name, start_date, started_at, updated_at, ended_at, status, final_totals, payload, created_at
         )
         VALUES ($1, $2, $3, $4::date, $5::timestamptz, $6::timestamptz, $7::timestamptz, $8, $9::jsonb, $10::jsonb, NOW())
         ON CONFLICT (plan_id) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             name = EXCLUDED.name,
             start_date = EXCLUDED.start_date,
             started_at = EXCLUDED.started_at,
             updated_at = EXCLUDED.updated_at,
             ended_at = EXCLUDED.ended_at,
             status = EXCLUDED.status,
             final_totals = EXCLUDED.final_totals,
             payload = EXCLUDED.payload`,
        [
          plan.id,
          userId,
          plan.name,
          this.normalizeDate(plan.startDate),
          this.parseIsoDateTime(plan.startedAt, now),
          this.parseIsoDateTime(plan.updatedAt || plan.startedAt, now),
          plan.endedAt ? this.parseIsoDateTime(plan.endedAt, now) : null,
          plan.status,
          JSON.stringify(plan.finalTotals || null),
          JSON.stringify(plan),
        ],
      );
    }

    for (const entry of preparedStore.entries) {
      const transactionId = this.buildDeterministicId([
        userId,
        entry.planId || 'no-plan',
        this.normalizeDate(entry.date),
        entry.status || 'active',
      ]);
      await pool.query(
        `INSERT INTO wellness_user_activity_transactions (
           transaction_id, user_id, plan_id, entry_date, status, payload, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4::date, $5, $6::jsonb, NOW(), NOW())
         ON CONFLICT (transaction_id) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             plan_id = EXCLUDED.plan_id,
             entry_date = EXCLUDED.entry_date,
             status = EXCLUDED.status,
             payload = EXCLUDED.payload,
             updated_at = NOW()`,
        [
          transactionId,
          userId,
          entry.planId || null,
          this.normalizeDate(entry.date),
          entry.status || 'active',
          JSON.stringify(entry),
        ],
      );
    }

    for (const planData of planDerivations) {
      for (const transaction of planData.planTransactions) {
        const transactionId = this.buildDeterministicId([
          userId,
          planData.plan.id,
          this.normalizeDate(transaction.date),
          transaction.source,
          transaction.sortOrder,
          transaction.activityName,
        ]);
        await pool.query(
          `INSERT INTO wellness_plan_transactions (
             transaction_id, user_id, plan_id, entry_date, activity_name, source, detail, sort_order, payload, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9::jsonb, NOW(), NOW())
           ON CONFLICT (transaction_id) DO UPDATE
           SET user_id = EXCLUDED.user_id,
               plan_id = EXCLUDED.plan_id,
               entry_date = EXCLUDED.entry_date,
               activity_name = EXCLUDED.activity_name,
               source = EXCLUDED.source,
               detail = EXCLUDED.detail,
               sort_order = EXCLUDED.sort_order,
               payload = EXCLUDED.payload,
               updated_at = NOW()`,
          [
            transactionId,
            userId,
            planData.plan.id,
            this.normalizeDate(transaction.date),
            transaction.activityName,
            transaction.source,
            transaction.detail,
            transaction.sortOrder,
            JSON.stringify(transaction),
          ],
        );
      }

      for (const score of planData.dailyScores) {
        const scoreId = this.buildDeterministicId([
          userId,
          planData.plan.id,
          this.normalizeDate(score.date),
        ]);
        await pool.query(
          `INSERT INTO wellness_daily_scores (
             score_id, user_id, plan_id, score_date, source,
             physical_score, mental_score, total_score,
             cumulative_physical_score, cumulative_mental_score, cumulative_total_score,
             workout_minutes, payload, created_at, updated_at
           )
           VALUES (
             $1, $2, $3, $4::date, $5,
             $6, $7, $8,
             $9, $10, $11,
             $12, $13::jsonb, NOW(), NOW()
           )
           ON CONFLICT (score_id) DO UPDATE
           SET user_id = EXCLUDED.user_id,
               plan_id = EXCLUDED.plan_id,
               score_date = EXCLUDED.score_date,
               source = EXCLUDED.source,
               physical_score = EXCLUDED.physical_score,
               mental_score = EXCLUDED.mental_score,
               total_score = EXCLUDED.total_score,
               cumulative_physical_score = EXCLUDED.cumulative_physical_score,
               cumulative_mental_score = EXCLUDED.cumulative_mental_score,
               cumulative_total_score = EXCLUDED.cumulative_total_score,
               workout_minutes = EXCLUDED.workout_minutes,
               payload = EXCLUDED.payload,
               updated_at = NOW()`,
          [
            scoreId,
            userId,
            planData.plan.id,
            this.normalizeDate(score.date),
            score.source,
            score.physicalScore,
            score.mentalScore,
            score.totalScore,
            score.cumulativePhysicalScore,
            score.cumulativeMentalScore,
            score.cumulativeTotalScore,
            score.workoutMinutes,
            JSON.stringify(score),
          ],
        );

      }
    }
  }

  private filePath(userId: string): string {
    return path.join(DATA_DIR, `${sanitizeUserId(userId)}.json`);
  }

  private normalizeDate(value?: string | null) {
    if (!value) return new Date().toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private defaultStore(): WellnessStoredState {
    return {
      entries: [],
      form: null,
      plans: [],
      derived: null,
      updatedAt: this.nowIso(),
    };
  }

  private sortEntries(entries: WellnessEntry[]) {
    return [...entries]
      .filter((entry) => entry && entry.date)
      .sort((left, right) => right.date.localeCompare(left.date));
  }

  private sortPlans(plans: WellnessPlanRecord[]) {
    return [...plans]
      .filter(Boolean)
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
        return String(right.startDate || '').localeCompare(String(left.startDate || ''));
      });
  }

  private normalizePlanRecord(plan: Partial<WellnessPlanRecord> | null | undefined): WellnessPlanRecord | null {
    if (!plan?.startDate) return null;
    const startedAt = plan.startedAt || this.nowIso();
    const normalizedStartDate = this.normalizeDate(plan.startDate);
    return {
      id: String(plan.id || buildPlanId(normalizedStartDate, startedAt)),
      name: String(plan.name || buildPlanName(normalizedStartDate)),
      startDate: normalizedStartDate,
      startedAt,
      updatedAt: plan.updatedAt || startedAt,
      endedAt: plan.endedAt || null,
      status: plan.status === 'inactive' ? 'inactive' : 'active',
      finalTotals: (plan as any).finalTotals || null,
    };
  }

  private normalizeEntryRecord(entry: WellnessEntry, fallbackPlanId?: string | null): WellnessEntry {
    const now = this.nowIso();
    return {
      ...entry,
      date: this.normalizeDate(entry.date),
      planId: entry.planId === undefined ? (fallbackPlanId ?? null) : entry.planId,
      status: entry.status === 'inactive' ? 'inactive' : 'active',
      createdAt: entry.createdAt || now,
      updatedAt: entry.updatedAt || now,
    };
  }

  private normalizeStore(data: Partial<WellnessStoredState> | null | undefined): WellnessStoredState {
    const plans = this.sortPlans((data?.plans || [])
      .map((plan) => this.normalizePlanRecord(plan))
      .filter(Boolean) as WellnessPlanRecord[]);
    const activePlan = plans.find((plan) => plan.status === 'active') || null;
    const entries = this.sortEntries((data?.entries || []).map((entry) => this.normalizeEntryRecord(entry, activePlan?.id || null)));
    return {
      entries,
      form: data?.form || null,
      plans,
      derived: data?.derived || null,
      updatedAt: data?.updatedAt || this.nowIso(),
    };
  }

  private buildEntriesHash(entries: WellnessEntry[]) {
    return entries
      .map((entry) => `${this.normalizeDate(entry.date)}:${entry.updatedAt || entry.createdAt || ''}:${entry.planId || ''}:${entry.status || 'active'}`)
      .join('|');
  }

  private deriveScoresWithCache(store: WellnessStoredState, scoringRules: WellnessScoringRules) {
    const plan = this.activePlanForStore(store);
    const entries = this.activeEntriesForPlan(store.entries, plan?.id || null);
    const rulesHash = safeJsonHash(scoringRules);
    const entriesHash = this.buildEntriesHash(entries);
    const computedOnDate = this.normalizeDate();
    const cache = store.derived || null;
    const cacheValid = Boolean(
      cache
      && cache.computedOnDate === computedOnDate
      && cache.planId === (plan?.id || null)
      && cache.rulesHash === rulesHash
      && cache.entriesHash === entriesHash,
    );

    if (cacheValid) {
      return {
        store,
        entries,
        plan,
        dailyScores: cache?.dailyScores || [],
        planTransactions: cache?.planTransactions || [],
      };
    }

    const dailyScores = this.buildDailyScores(entries, plan, scoringRules);
    const planTransactions = this.buildPlanTransactions(entries, plan, scoringRules, dailyScores);

    return {
      store: {
        ...store,
        derived: {
          computedOnDate,
          planId: plan?.id || null,
          rulesHash,
          entriesHash,
          dailyScores,
          planTransactions,
        },
      },
      entries,
      plan,
      dailyScores,
      planTransactions,
    };
  }

  private resolveForm(entries: WellnessEntry[], form: Record<string, any> | null) {
    const today = this.normalizeDate();
    const todayEntry = entries.find((entry) => entry.date === today);
    if (todayEntry) return todayEntry;
    if (!form) return { date: today };
    return { ...form, date: this.normalizeDate(form.date || today) };
  }

  private activePlanForStore(store: WellnessStoredState) {
    return store.plans.find((plan) => plan.status === 'active') || null;
  }

  private activeEntriesForPlan(entries: WellnessEntry[], activePlanId?: string | null) {
    return this.sortEntries(entries.filter((entry) => {
      if (!entry || entry.status === 'inactive') return false;
      if (activePlanId) return entry.planId === activePlanId;
      return !entry.planId;
    }));
  }

  async loadScoringRules(): Promise<WellnessScoringRules> {
    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      const result = await pool.query('SELECT payload FROM wellness_settings WHERE setting_key = $1', ['scoring_rules']);
      return normalizeScoringRules(result.rows[0]?.payload || DEFAULT_SCORING_RULES);
    }

    if (!fs.existsSync(SCORING_RULES_FILE)) {
      return normalizeScoringRules(DEFAULT_SCORING_RULES);
    }

    try {
      const raw = fs.readFileSync(SCORING_RULES_FILE, 'utf-8');
      return normalizeScoringRules(JSON.parse(raw));
    } catch {
      return normalizeScoringRules(DEFAULT_SCORING_RULES);
    }
  }

  private async rebuildDerivedForAllUsers(scoringRules: WellnessScoringRules) {
    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      if (!pool) return;
      const result = await pool.query(`
        SELECT DISTINCT user_id
        FROM (
          SELECT user_id FROM wellness_user_activity_transactions
          UNION
          SELECT user_id FROM wellness_user_plans
        ) AS users
      `);
      for (const row of result.rows || []) {
        const normalizedStore = await this.loadStoreFromDatabase(String(row.user_id));
        const derived = this.deriveScoresWithCache({ ...normalizedStore, derived: null }, scoringRules);
        await this.persistStoreToDatabase(String(row.user_id), derived.store);
      }
      return;
    }

    const files = fs.readdirSync(DATA_DIR).filter((name) => name.endsWith('.json') && name !== 'scoring-rules.json');
    for (const fileName of files) {
      try {
        const filePath = path.join(DATA_DIR, fileName);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const normalizedStore = this.normalizeStore(parsed);
        const derived = this.deriveScoresWithCache({ ...normalizedStore, derived: null }, scoringRules);
        fs.writeFileSync(filePath, JSON.stringify(this.normalizeStore(derived.store), null, 2), 'utf-8');
      } catch {
        // Skip malformed local files during backfill.
      }
    }
  }

  async saveScoringRules(payload: Partial<WellnessScoringRules> & { options?: { rebuildAllUsers?: boolean } }) {
    const rulesInput = payload?.activities || payload?.dailyPenalty || payload?.sleep || payload?.targets ? payload : {};
    const normalizedRules = normalizeScoringRules(rulesInput);

    if (this.hasDatabase()) {
      const pool = await this.ensureSchema();
      await pool.query(
        `INSERT INTO wellness_settings (setting_key, payload, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (setting_key) DO UPDATE
         SET payload = EXCLUDED.payload,
             updated_at = NOW()`,
        ['scoring_rules', JSON.stringify(normalizedRules)],
      );
      if (payload?.options?.rebuildAllUsers) {
        await this.rebuildDerivedForAllUsers(normalizedRules);
      }
      return normalizedRules;
    }

    fs.writeFileSync(SCORING_RULES_FILE, JSON.stringify(normalizedRules, null, 2), 'utf-8');
    if (payload?.options?.rebuildAllUsers) {
      await this.rebuildDerivedForAllUsers(normalizedRules);
    }
    return normalizedRules;
  }

  private buildDailyScores(entries: WellnessEntry[], plan: WellnessPlan, scoringRules: WellnessScoringRules) {
    if (!plan?.startDate) return [] as WellnessDailyScore[];
    const endDate = this.resolvePlanEndDate(plan);
    return this.buildDailyScoresForRange(entries, plan.startDate, endDate, scoringRules);
  }

  private buildDailyScoresForRange(
    entries: WellnessEntry[],
    startDate: string,
    endDate: string,
    scoringRules: WellnessScoringRules,
  ) {
    const start = new Date(`${this.normalizeDate(startDate)}T00:00:00Z`);
    const end = new Date(`${this.normalizeDate(endDate)}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [] as WellnessDailyScore[];

    const entryMap = new Map(entries.map((entry) => [this.normalizeDate(entry.date), entry]));
    const ascending: WellnessDailyScore[] = [];
    let cumulativePhysicalScore = 0;
    let cumulativeMentalScore = 0;
    let cumulativeTotalScore = 0;

    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      const entry = entryMap.get(date) || { date };
      const result = computeEntryScores(entry, scoringRules);
      cumulativePhysicalScore = Number((cumulativePhysicalScore + result.physicalScore).toFixed(2));
      cumulativeMentalScore = Number((cumulativeMentalScore + result.mentalScore).toFixed(2));
      cumulativeTotalScore = Number((cumulativeTotalScore + result.totalScore).toFixed(2));
      ascending.push({
        date,
        source: entryMap.has(date) ? 'entry' : 'auto',
        physicalScore: result.physicalScore,
        mentalScore: result.mentalScore,
        totalScore: result.totalScore,
        cumulativePhysicalScore,
        cumulativeMentalScore,
        cumulativeTotalScore,
        workoutMinutes: result.workoutMinutes,
      });
    }

    return ascending.sort((left, right) => right.date.localeCompare(left.date));
  }

  private resolvePlanEndDate(plan: WellnessPlan) {
    if (!plan?.startDate) return this.normalizeDate();
    if (plan.status === 'inactive' && plan.endedAt) {
      const endedAtDate = this.normalizeDate(plan.endedAt);
      if (endedAtDate >= this.normalizeDate(plan.startDate)) return endedAtDate;
    }
    return this.normalizeDate();
  }

  private buildActivityEntryRows(entries: WellnessEntry[], scoringRules: WellnessScoringRules): WellnessActivityEntryRow[] {
    const rows: WellnessActivityEntryRow[] = [];
    const rules = normalizeScoringRules(scoringRules);

    for (const entry of entries) {
      const entryDate = this.normalizeDate(entry.date);

      for (const rule of rules.activities) {
        const value = safeNumber(entry[rule.key]);
        if (value === 0) continue;

        const physicalContribution = roundScore(computeRuleContribution(value, rule.physicalMultiplier, rule.physicalDivisor));
        const mentalContribution = roundScore(computeRuleContribution(value, rule.mentalMultiplier, rule.mentalDivisor));

        rows.push({
          planId: entry.planId || null,
          date: entryDate,
          activityKey: rule.key,
          activityLabel: rule.label,
          unit: rule.unit,
          value: roundScore(value),
          source: 'entry',
          physicalContribution,
          mentalContribution,
          totalContribution: roundScore(physicalContribution + mentalContribution),
        });
      }

      const explicitSleepHours = safeNumber(entry.sleepHours);
      if (explicitSleepHours > 0) {
        const sleepDelta = (explicitSleepHours - rules.sleep.baselineHours)
          / Math.max(0.1, rules.sleep.stepHours)
          * rules.sleep.scorePerStep;
        const sleepContribution = roundScore(sleepDelta);
        rows.push({
          planId: entry.planId || null,
          date: entryDate,
          activityKey: 'sleepHours',
          activityLabel: 'Sleep',
          unit: 'hrs',
          value: roundScore(explicitSleepHours),
          source: 'entry',
          physicalContribution: sleepContribution,
          mentalContribution: sleepContribution,
          totalContribution: roundScore(sleepContribution * 2),
        });
      }
    }

    return rows.sort((left, right) => {
      const dateCompare = right.date.localeCompare(left.date);
      if (dateCompare !== 0) return dateCompare;
      return left.activityKey.localeCompare(right.activityKey);
    });
  }

  private buildActivityTransactions(entry: WellnessEntry): WellnessPlanTransaction[] {
    const transactions: WellnessPlanTransaction[] = [];
    const pushTransaction = (activityName: string, detail: string) => {
      transactions.push({
        date: this.normalizeDate(entry.date),
        activityName,
        source: 'activity',
        detail,
        sortOrder: 1,
      });
    };

    if (Number(entry.runningDistanceKm || 0) > 0 || Number(entry.runningMinutes || 0) > 0) {
      pushTransaction('Running', `${formatMetric(entry.runningDistanceKm)} km, ${formatMetric(entry.runningMinutes)} mins`);
    }
    if (Number(entry.cyclingDistanceKm || 0) > 0 || Number(entry.cyclingMinutes || 0) > 0) {
      pushTransaction('Cycling', `${formatMetric(entry.cyclingDistanceKm)} km, ${formatMetric(entry.cyclingMinutes)} mins`);
    }
    if (Number(entry.walkingDistanceKm || 0) > 0 || Number(entry.walkingMinutes || 0) > 0) {
      pushTransaction('Walking', `${formatMetric(entry.walkingDistanceKm)} km, ${formatMetric(entry.walkingMinutes)} mins`);
    }
    if (Number(entry.exerciseMinutes || 0) > 0) {
      pushTransaction('Workout', `${formatMetric(entry.exerciseMinutes)} mins`);
    }
    if (Number(entry.yogaMinutes || 0) > 0) {
      pushTransaction('Yoga', `${formatMetric(entry.yogaMinutes)} mins`);
    }
    if (Number(entry.badmintonMinutes || 0) > 0) {
      pushTransaction('Badminton', `${formatMetric(entry.badmintonMinutes)} mins`);
    }
    if (Number(entry.footballMinutes || 0) > 0) {
      pushTransaction('Football', `${formatMetric(entry.footballMinutes)} mins`);
    }
    if (Number(entry.cricketMinutes || 0) > 0) {
      pushTransaction('Cricket', `${formatMetric(entry.cricketMinutes)} mins`);
    }
    if (Number(entry.swimmingMinutes || 0) > 0) {
      pushTransaction('Swimming', `${formatMetric(entry.swimmingMinutes)} mins`);
    }
    if (Number(entry.meditationMinutes || 0) > 0) {
      pushTransaction('Meditation', `${formatMetric(entry.meditationMinutes)} mins`);
    }
    if (Number(entry.whiskyPegs || 0) > 0) {
      pushTransaction('Whisky', `${formatMetric(entry.whiskyPegs)} pegs`);
    }
    if (Number(entry.fastFoodServings || 0) > 0) {
      pushTransaction('Fast food', `${formatMetric(entry.fastFoodServings)} count`);
    }
    if (Number(entry.sugarServings || 0) > 0) {
      pushTransaction('Sugar', `${formatMetric(entry.sugarServings)} count`);
    }
    return transactions;
  }

  private buildPlanTransactions(
    entries: WellnessEntry[],
    plan: WellnessPlan,
    scoringRules: WellnessScoringRules,
    dailyScores: WellnessDailyScore[],
    endDateOverride?: string,
  ) {
    if (!plan?.startDate) return [] as WellnessPlanTransaction[];
    const effectiveEndDate = this.normalizeDate(endDateOverride || this.resolvePlanEndDate(plan));
    const start = new Date(`${plan.startDate}T00:00:00Z`);
    const end = new Date(`${effectiveEndDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || start > end) return [];

    const entryMap = new Map(entries.map((entry) => [this.normalizeDate(entry.date), entry]));
    const scoreMap = new Map(dailyScores.map((score) => [score.date, score]));
    const transactions: WellnessPlanTransaction[] = [];

    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      const entry = entryMap.get(date);
      const score = scoreMap.get(date);
      const computed = computeEntryScores(entry || { date }, scoringRules);

      transactions.push({
        date,
        activityName: 'Daily drain',
        source: 'daily-drain',
        detail: `Physical -${formatMetric(scoringRules.dailyPenalty.physical)}, Mental -${formatMetric(scoringRules.dailyPenalty.mental)} → Day ${formatMetric(score?.totalScore || 0)} pts · Cumulative ${formatMetric(score?.cumulativeTotalScore || 0)} pts`,
        sortOrder: 0,
      });

      // Sleep score row — always shown (uses default hours when no explicit entry)
      const hasExplicitSleep = Number(entry?.sleepHours || 0) > 0;
      const sleepHours = hasExplicitSleep
        ? Number(entry!.sleepHours)
        : Number(scoringRules.sleep.defaultHours || 0);
      const sleepTotal = roundScore(computed.sleepPhysical + computed.sleepMental);
      if (sleepHours > 0 || sleepTotal !== 0) {
        transactions.push({
          date,
          activityName: 'Sleep',
          source: 'activity',
          detail: `${formatMetric(sleepHours)} hrs${hasExplicitSleep ? '' : ' (default)'} → +${formatMetric(sleepTotal)} pts (Physical +${formatMetric(computed.sleepPhysical)}, Mental +${formatMetric(computed.sleepMental)})`,
          sortOrder: 1,
        });
      }

      if (entry) {
        transactions.push(...this.buildActivityTransactions(entry));
      }
    }

    return transactions.sort((left, right) => {
      const dateCompare = right.date.localeCompare(left.date);
      if (dateCompare !== 0) return dateCompare;
      const orderCompare = left.sortOrder - right.sortOrder;
      if (orderCompare !== 0) return orderCompare;
      return left.activityName.localeCompare(right.activityName);
    });
  }

  private buildPublicState(store: WellnessStoredState, scoringRules: WellnessScoringRules): WellnessState {
    const derived = this.deriveScoresWithCache(store, scoringRules);
    return {
      entries: derived.entries,
      form: this.resolveForm(derived.entries, derived.store.form),
      plan: derived.plan,
      plans: this.sortPlans(derived.store.plans),
      dailyScores: derived.dailyScores,
      planTransactions: derived.planTransactions,
    };
  }

  private async loadLegacyDatabaseStore(userId: string): Promise<WellnessStoredState | null> {
    const pool = await this.ensureSchema();
    if (!pool) return null;

    const existsQuery = async (tableName: string) => {
      const result = await pool.query('SELECT to_regclass($1) AS name', [tableName]);
      return Boolean(result.rows[0]?.name);
    };

    const [entriesExists, plansExists] = await Promise.all([
      existsQuery('public.wellness_entries'),
      existsQuery('public.wellness_plans'),
    ]);

    if (!entriesExists && !plansExists) return null;

    const [entryResult, planResult] = await Promise.all([
      entriesExists
        ? pool.query('SELECT payload FROM wellness_entries WHERE user_id = $1 ORDER BY entry_date DESC', [userId])
        : Promise.resolve({ rows: [] }),
      plansExists
        ? pool.query('SELECT plan_name, start_date, started_at, updated_at FROM wellness_plans WHERE user_id = $1', [userId])
        : Promise.resolve({ rows: [] }),
    ]);

    const planRow = planResult.rows[0];
    const legacyPlan = planRow
      ? this.normalizePlanRecord({
          name: planRow.plan_name,
          startDate: this.normalizeDate(planRow.start_date),
          startedAt: new Date(planRow.started_at).toISOString(),
          updatedAt: new Date(planRow.updated_at).toISOString(),
          status: 'active',
        })
      : null;

    const entries = this.sortEntries((entryResult.rows || []).map((row: { payload: WellnessEntry }) => (
      this.normalizeEntryRecord(row.payload, legacyPlan?.id || null)
    )));

    if (!legacyPlan && entries.length === 0) return null;

    return this.normalizeStore({
      entries,
      form: entries[0] || null,
      plans: legacyPlan ? [legacyPlan] : [],
      updatedAt: this.nowIso(),
    });
  }

  private async loadStoreFromDatabase(userId: string): Promise<WellnessStoredState> {
    const pool = await this.ensureSchema();
    if (!pool) return this.defaultStore();

    const [planResult, entryResult] = await Promise.all([
      pool.query(
        `SELECT payload
         FROM wellness_user_plans
         WHERE user_id = $1
         ORDER BY start_date DESC`,
        [userId],
      ),
      pool.query(
        `SELECT payload
         FROM wellness_user_activity_transactions
         WHERE user_id = $1
         ORDER BY entry_date DESC, updated_at DESC`,
        [userId],
      ),
    ]);

    const plans = (planResult.rows || [])
      .map((row: { payload: Partial<WellnessPlanRecord> }) => this.normalizePlanRecord(row.payload))
      .filter(Boolean) as WellnessPlanRecord[];
    const entries = this.sortEntries((entryResult.rows || [])
      .map((row: { payload: WellnessEntry }) => this.normalizeEntryRecord(row.payload)));

    if (plans.length || entries.length) {
      return this.normalizeStore({
        entries,
        form: entries[0] || null,
        plans,
        derived: null,
        updatedAt: this.nowIso(),
      });
    }

    const legacyStore = await this.loadLegacyDatabaseStore(userId);
    return legacyStore || this.defaultStore();
  }

  private loadStoreFromFile(userId: string): WellnessStoredState {
    const file = this.filePath(userId);
    if (!fs.existsSync(file)) return this.defaultStore();

    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.plans)) {
        return this.normalizeStore(parsed);
      }

      const legacyPlan = this.normalizePlanRecord(parsed?.plan || null);
      const entries = this.sortEntries((Array.isArray(parsed?.entries) ? parsed.entries : [])
        .map((entry: WellnessEntry) => this.normalizeEntryRecord(entry, legacyPlan?.id || null)));
      return this.normalizeStore({
        entries,
        form: parsed?.form || null,
        plans: legacyPlan ? [legacyPlan] : [],
        updatedAt: parsed?.updatedAt || this.nowIso(),
      });
    } catch {
      return this.defaultStore();
    }
  }

  private async loadStore(userId: string): Promise<WellnessStoredState> {
    return this.hasDatabase() ? this.loadStoreFromDatabase(userId) : this.loadStoreFromFile(userId);
  }

  private async persistStoreToDatabase(userId: string, store: WellnessStoredState) {
    const pool = await this.ensureSchema();
    if (!pool) return;
    const normalizedStore = this.normalizeStore({ ...store, updatedAt: this.nowIso() });
    const scoringRules = await this.loadScoringRules();
    await this.syncNormalizedTablesForUser(pool, userId, normalizedStore, scoringRules);
  }

  private persistStoreToFile(userId: string, store: WellnessStoredState) {
    const normalizedStore = this.normalizeStore({ ...store, updatedAt: this.nowIso() });
    fs.writeFileSync(this.filePath(userId), JSON.stringify(normalizedStore, null, 2), 'utf-8');
  }

  private async persistStore(userId: string, store: WellnessStoredState) {
    if (this.hasDatabase()) {
      await this.persistStoreToDatabase(userId, store);
      return;
    }
    this.persistStoreToFile(userId, store);
  }

  private mergeActiveEntries(
    existingEntries: WellnessEntry[],
    incomingEntries: WellnessEntry[],
    activePlanId?: string | null,
  ) {
    const incomingByDate = new Map(incomingEntries.map((entry) => [entry.date, entry]));
    const preserved = existingEntries.filter((entry) => {
      if (entry.status === 'inactive') return true;
      if (activePlanId) return entry.planId !== activePlanId;
      return Boolean(entry.planId);
    });

    const existingActiveByDate = new Map(existingEntries
      .filter((entry) => entry.status !== 'inactive' && (activePlanId ? entry.planId === activePlanId : !entry.planId))
      .map((entry) => [entry.date, entry]));

    const mergedIncoming = incomingEntries.map((entry) => {
      const existing = existingActiveByDate.get(entry.date);
      return this.normalizeEntryRecord({
        ...entry,
        createdAt: existing?.createdAt,
        updatedAt: this.nowIso(),
        planId: activePlanId || null,
        status: 'active',
      }, activePlanId || null);
    });

    return this.sortEntries([...preserved, ...mergedIncoming, ...Array.from(incomingByDate.values()).filter(() => false)]);
  }

  async load(userId: string): Promise<WellnessState> {
    const [store, scoringRules] = await Promise.all([this.loadStore(userId), this.loadScoringRules()]);
    const normalizedStore = this.normalizeStore(store);
    const derived = this.deriveScoresWithCache(normalizedStore, scoringRules);
    return this.buildPublicState(derived.store, scoringRules);
  }

  async save(userId: string, payload: { entries: WellnessEntry[]; form: Record<string, any> | null; plan?: WellnessPlan | null }): Promise<WellnessState> {
    const [store, scoringRules] = await Promise.all([this.loadStore(userId), this.loadScoringRules()]);
    const normalizedStore = this.normalizeStore(store);
    const activePlan = payload.plan === undefined
      ? this.activePlanForStore(normalizedStore)
      : this.normalizePlanRecord(payload.plan || null);

    const incomingEntries = this.sortEntries(Array.isArray(payload.entries) ? payload.entries : []);
    const mergedEntries = this.mergeActiveEntries(normalizedStore.entries, incomingEntries, activePlan?.id || null);
    const updatedPlans = activePlan
      ? this.sortPlans(normalizedStore.plans.map((plan) => (
          plan.id === activePlan.id ? { ...plan, ...activePlan, updatedAt: this.nowIso() } : plan
        )))
      : normalizedStore.plans;

    const nextStore = this.normalizeStore({
      entries: mergedEntries,
      form: payload.form || normalizedStore.form,
      plans: updatedPlans,
      updatedAt: this.nowIso(),
    });

    const derived = this.deriveScoresWithCache(nextStore, scoringRules);
    await this.persistStore(userId, derived.store);
    return this.buildPublicState(derived.store, scoringRules);
  }

  async clear(userId: string): Promise<WellnessState> {
    const nextStore = this.defaultStore();
    await this.persistStore(userId, nextStore);
    const scoringRules = await this.loadScoringRules();
    return this.buildPublicState(nextStore, scoringRules);
  }

  async startPlan(userId: string, startDate: string, name?: string) {
    const [store, scoringRules] = await Promise.all([this.loadStore(userId), this.loadScoringRules()]);
    const normalizedStore = this.normalizeStore(store);
    const now = this.nowIso();

    const plans = normalizedStore.plans.map((plan) => (
      plan.status === 'active'
        ? { ...plan, status: 'inactive' as WellnessPlanStatus, endedAt: now, updatedAt: now }
        : plan
    ));
    const entries = normalizedStore.entries.map((entry) => (
      entry.status === 'active'
        ? { ...entry, status: 'inactive' as WellnessEntryStatus, updatedAt: now }
        : entry
    ));

    const normalizedStartDate = this.normalizeDate(startDate);
    const newPlan = this.normalizePlanRecord({
      id: buildPlanId(normalizedStartDate, now),
      name: String(name || '').trim() || buildPlanName(normalizedStartDate),
      startDate: normalizedStartDate,
      startedAt: now,
      updatedAt: now,
      status: 'active',
      endedAt: null,
    });

    const nextStore = this.normalizeStore({
      entries,
      form: { date: this.normalizeDate() },
      plans: [newPlan as WellnessPlanRecord, ...plans],
      updatedAt: now,
    });

    const derived = this.deriveScoresWithCache(nextStore, scoringRules);
    await this.persistStore(userId, derived.store);
    return this.buildPublicState(derived.store, scoringRules);
  }

  async renamePlan(userId: string, name: string) {
    const [store, scoringRules] = await Promise.all([this.loadStore(userId), this.loadScoringRules()]);
    const normalizedStore = this.normalizeStore(store);
    const activePlan = this.activePlanForStore(normalizedStore);
    if (!activePlan) {
      return this.buildPublicState(normalizedStore, scoringRules);
    }

    const nextStore = this.normalizeStore({
      ...normalizedStore,
      plans: normalizedStore.plans.map((plan) => (
        plan.id === activePlan.id
          ? { ...plan, name: String(name || '').trim() || plan.name, updatedAt: this.nowIso() }
          : plan
      )),
      updatedAt: this.nowIso(),
    });

    const derived = this.deriveScoresWithCache(nextStore, scoringRules);
    await this.persistStore(userId, derived.store);
    return this.buildPublicState(derived.store, scoringRules);
  }

  async resetCurrentPlan(userId: string) {
    const [store, scoringRules] = await Promise.all([this.loadStore(userId), this.loadScoringRules()]);
    const normalizedStore = this.normalizeStore(store);
    const activePlan = this.activePlanForStore(normalizedStore);
    if (!activePlan) {
      return this.buildPublicState(normalizedStore, scoringRules);
    }

    const now = this.nowIso();
    const nextStore = this.normalizeStore({
      entries: normalizedStore.entries.map((entry) => (
        entry.planId === activePlan.id && entry.status !== 'inactive'
          ? { ...entry, status: 'inactive' as WellnessEntryStatus, updatedAt: now }
          : entry
      )),
      form: { date: this.normalizeDate() },
      plans: normalizedStore.plans.map((plan) => (
        plan.id === activePlan.id
          ? { ...plan, status: 'inactive' as WellnessPlanStatus, endedAt: now, updatedAt: now }
          : plan
      )),
      updatedAt: now,
    });

    const derived = this.deriveScoresWithCache(nextStore, scoringRules);
    await this.persistStore(userId, derived.store);
    return this.buildPublicState(derived.store, scoringRules);
  }

  async closePlan(userId: string) {
    const [store, scoringRules] = await Promise.all([this.loadStore(userId), this.loadScoringRules()]);
    const normalizedStore = this.normalizeStore(store);
    const activePlan = this.activePlanForStore(normalizedStore);
    if (!activePlan) {
      return this.buildPublicState(normalizedStore, scoringRules);
    }

    const now = this.nowIso();
    const planEntries = this.activeEntriesForPlan(normalizedStore.entries, activePlan.id);
    const dailyScores = this.buildDailyScores(planEntries, activePlan, scoringRules);
    const lastScore = dailyScores[0] || null; // sorted descending — [0] is most recent
    const finalTotals = {
      physical: Number((lastScore?.cumulativePhysicalScore || 0).toFixed(2)),
      mental: Number((lastScore?.cumulativeMentalScore || 0).toFixed(2)),
      total: Number((lastScore?.cumulativeTotalScore || 0).toFixed(2)),
      days: dailyScores.length,
    };

    const nextStore = this.normalizeStore({
      ...normalizedStore,
      plans: normalizedStore.plans.map((plan) => (
        plan.id === activePlan.id
          ? { ...plan, status: 'inactive' as WellnessPlanStatus, endedAt: now, updatedAt: now, finalTotals }
          : plan
      )),
      updatedAt: now,
    });

    await this.persistStore(userId, nextStore);
    return this.buildPublicState(nextStore, scoringRules);
  }

  async loadPlanDetails(userId: string, planId: string) {
    const [store, scoringRules] = await Promise.all([this.loadStore(userId), this.loadScoringRules()]);
    const normalizedStore = this.normalizeStore(store);
    const plan = normalizedStore.plans.find((p) => p.id === planId) || null;
    if (!plan) return null;

    const planEntries = this.sortEntries(normalizedStore.entries.filter((e) => e.planId === planId));
    const endDate = this.resolvePlanEndDate(plan);
    const descending = this.buildDailyScoresForRange(planEntries, plan.startDate, endDate, scoringRules);
    const ascending = [...descending].sort((a, b) => a.date.localeCompare(b.date));
    const planTransactions = this.buildPlanTransactions(planEntries, plan, scoringRules, descending, endDate);
    return { plan, dailyScores: ascending, planTransactions };
  }

  async loadAnalytics(userId: string, days = 90) {
    const [store, scoringRules] = await Promise.all([this.loadStore(userId), this.loadScoringRules()]);
    const normalizedStore = this.normalizeStore(store);
    const lookbackDays = Math.max(1, Math.min(3650, Number(days) || 90));

    const perPlan = normalizedStore.plans.map((plan) => {
      const entries = this.sortEntries(normalizedStore.entries.filter((entry) => entry.planId === plan.id));
      const endDate = this.resolvePlanEndDate(plan);
      const descending = this.buildDailyScoresForRange(entries, plan.startDate, endDate, scoringRules);
      const ascending = [...descending].sort((left, right) => left.date.localeCompare(right.date));
      return {
        plan,
        dailyScoresAsc: ascending,
      };
    });

    const selectedPlan = perPlan.find((item) => item.plan.status === 'active') || perPlan[0] || null;
    const selectedTrendRows = (selectedPlan?.dailyScoresAsc || []).slice(-lookbackDays);

    const allDailyScores = perPlan.flatMap((item) => item.dailyScoresAsc.map((score) => ({
      planId: item.plan.id,
      planName: item.plan.name,
      ...score,
    })));

    const highest = allDailyScores.reduce<typeof allDailyScores[number] | null>((best, current) => {
      if (!best) return current;
      if (current.totalScore > best.totalScore) return current;
      if (current.totalScore === best.totalScore && current.date > best.date) return current;
      return best;
    }, null);

    return {
      userId,
      totalDays: allDailyScores.length,
      totalPlans: normalizedStore.plans.length,
      selectedPlanId: selectedPlan?.plan.id || null,
      selectedPlanName: selectedPlan?.plan.name || null,
      highestWellnessScore: highest
        ? {
            planId: highest.planId,
            planName: highest.planName,
            date: highest.date,
            totalScore: highest.totalScore,
            physicalScore: highest.physicalScore,
            mentalScore: highest.mentalScore,
          }
        : null,
      scoreTrend: selectedTrendRows.map((row) => ({
        date: row.date,
        dailyTotalScore: row.totalScore,
        cumulativeTotalScore: row.cumulativeTotalScore,
      })),
    };
  }
}
