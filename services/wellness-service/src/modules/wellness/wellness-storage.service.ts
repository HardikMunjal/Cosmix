import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeEntryScores,
  DEFAULT_SCORING_RULES,
  normalizeScoringRules,
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

type WellnessStoredState = {
  entries: WellnessEntry[];
  form: Record<string, any> | null;
  plans: WellnessPlanRecord[];
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
      this.schemaPromise = pool?.query(`
        CREATE TABLE IF NOT EXISTS wellness_user_state (
          user_id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS wellness_settings (
          setting_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    }
    await this.schemaPromise;
    return this.getPool();
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
      updatedAt: this.nowIso(),
    };
  }

  private sortEntries(entries: WellnessEntry[]) {
    return [...entries]
      .filter((entry) => entry && entry.date)
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 365);
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
      updatedAt: data?.updatedAt || this.nowIso(),
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

  async saveScoringRules(rules: Partial<WellnessScoringRules>) {
    const normalizedRules = normalizeScoringRules(rules);

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
      return normalizedRules;
    }

    fs.writeFileSync(SCORING_RULES_FILE, JSON.stringify(normalizedRules, null, 2), 'utf-8');
    return normalizedRules;
  }

  private buildDailyScores(entries: WellnessEntry[], plan: WellnessPlan, scoringRules: WellnessScoringRules) {
    if (!plan?.startDate) return [] as WellnessDailyScore[];
    const today = this.normalizeDate();
    const start = new Date(`${plan.startDate}T00:00:00Z`);
    const end = new Date(`${today}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || start > end) return [];

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
    if (Number(entry.sleepHours || 0) > 0) {
      pushTransaction('Sleep', `${formatMetric(entry.sleepHours)} hrs`);
    }

    return transactions;
  }

  private buildPlanTransactions(entries: WellnessEntry[], plan: WellnessPlan, scoringRules: WellnessScoringRules, dailyScores: WellnessDailyScore[]) {
    if (!plan?.startDate) return [] as WellnessPlanTransaction[];
    const today = this.normalizeDate();
    const start = new Date(`${plan.startDate}T00:00:00Z`);
    const end = new Date(`${today}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || start > end) return [];

    const entryMap = new Map(entries.map((entry) => [this.normalizeDate(entry.date), entry]));
    const scoreMap = new Map(dailyScores.map((score) => [score.date, score]));
    const transactions: WellnessPlanTransaction[] = [];

    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      const entry = entryMap.get(date);
      const score = scoreMap.get(date);
      transactions.push({
        date,
        activityName: 'Daily drain',
        source: 'daily-drain',
        detail: `Physical -${formatMetric(scoringRules.dailyPenalty.physical)}, Mental -${formatMetric(scoringRules.dailyPenalty.mental)}. Day total ${formatMetric(score?.totalScore || 0)}. Cumulative ${formatMetric(score?.cumulativeTotalScore || 0)}`,
        sortOrder: 0,
      });
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
    const plan = this.activePlanForStore(store);
    const entries = this.activeEntriesForPlan(store.entries, plan?.id || null);
    const dailyScores = this.buildDailyScores(entries, plan, scoringRules);
    return {
      entries,
      form: this.resolveForm(entries, store.form),
      plan,
      plans: this.sortPlans(store.plans),
      dailyScores,
      planTransactions: this.buildPlanTransactions(entries, plan, scoringRules, dailyScores),
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

    const result = await pool.query('SELECT payload FROM wellness_user_state WHERE user_id = $1', [userId]);
    if (result.rows[0]?.payload) {
      return this.normalizeStore(result.rows[0].payload);
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
    await pool.query(
      `INSERT INTO wellness_user_state (user_id, payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET payload = EXCLUDED.payload,
           updated_at = NOW()`,
      [userId, JSON.stringify(normalizedStore)],
    );
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
    await this.persistStore(userId, normalizedStore);
    return this.buildPublicState(normalizedStore, scoringRules);
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

    await this.persistStore(userId, nextStore);
    return this.buildPublicState(nextStore, scoringRules);
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

    await this.persistStore(userId, nextStore);
    return this.buildPublicState(nextStore, scoringRules);
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

    await this.persistStore(userId, nextStore);
    return this.buildPublicState(nextStore, scoringRules);
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

    await this.persistStore(userId, nextStore);
    return this.buildPublicState(nextStore, scoringRules);
  }
}
