import { Injectable } from '@nestjs/common';
import { CoachRequestDto, TravelGoalDto, WellnessEntryDto } from './dto/coach-request.dto';

type NormalizedEntry = {
  date: string;
  runningMinutes: number;
  meditationMinutes: number;
  waterLiters: number;
  headacheLevel: number;
  exerciseMinutes: number;
  fastFoodServings: number;
  cricketMinutes: number;
  footballMinutes: number;
  badmintonMinutes: number;
  swimmingMinutes: number;
  moodScore: number;
  notes: string;
};

type NormalizedGoal = {
  id: string;
  title: string;
  location: string;
  targetMonth: string;
  budget: number;
  budgetLabel: string;
  vibe: string;
};

@Injectable()
export class WellnessService {
  getDefaults() {
    return {
      coach: {
        name: 'Astra',
        persona: 'A cheerful travel-and-wellness robot guide who turns daily habits into practical next steps.',
      },
      goals: [
        {
          id: 'hampta-pass',
          title: 'Hampta Pass in June 2026',
          location: 'Himachal Pradesh',
          targetMonth: '2026-06',
          budget: 70000,
          budgetLabel: 'Rs. 70,000',
          vibe: 'Alpine trek, stamina, mountain recovery',
        },
        {
          id: 'norway-dream',
          title: 'Norway dream trip',
          location: 'Norway',
          targetMonth: 'Flexible',
          budget: 600000,
          budgetLabel: 'Rs. 6,00,000',
          vibe: 'Aurora skies, long walks, premium budget planning',
        },
      ],
      starterEntry: this.normalizeEntry({
        date: new Date().toISOString().slice(0, 10),
        waterLiters: 2.5,
        moodScore: 7,
      }),
    };
  }

  buildCoachResponse(request: CoachRequestDto) {
    const entries = (request.entries || []).map((entry) => this.normalizeEntry(entry));
    const latestEntry = this.normalizeEntry(request.latestEntry || entries[0] || {});
    const goals = (request.goals || this.getDefaults().goals).map((goal) => this.normalizeGoal(goal));
    const recentEntries = [latestEntry, ...entries.filter((entry) => entry.date !== latestEntry.date)].slice(0, 7);

    const weeklyActiveMinutes = recentEntries.reduce((sum, entry) => sum + this.totalMovement(entry), 0);
    const averageWater = this.average(recentEntries.map((entry) => entry.waterLiters));
    const averageMeditation = this.average(recentEntries.map((entry) => entry.meditationMinutes));
    const averageMood = this.average(recentEntries.map((entry) => entry.moodScore));
    const averageHeadache = this.average(recentEntries.map((entry) => entry.headacheLevel));
    const fastFoodLoad = recentEntries.reduce((sum, entry) => sum + entry.fastFoodServings, 0);

    const suggestions = [];

    if (latestEntry.waterLiters < 2.5 || (latestEntry.headacheLevel >= 4 && latestEntry.waterLiters < 3)) {
      suggestions.push({
        title: 'Hydration first',
        detail: 'Your hydration is below the sweet spot for recovery. Add 1 or 2 more glasses of water and include electrolytes if the headache is building.',
        priority: 'high',
      });
    }

    if (latestEntry.headacheLevel >= 6) {
      suggestions.push({
        title: 'Ease intensity today',
        detail: 'High headache score means today should be a recovery day: dim lights, easy mobility, and no aggressive cardio.',
        priority: 'high',
      });
    }

    if (latestEntry.meditationMinutes < 10 && latestEntry.moodScore <= 6) {
      suggestions.push({
        title: 'Small reset, big return',
        detail: 'Do a 10-minute guided breathing block. It is the fastest lever here to improve clarity before your evening work or training.',
        priority: 'medium',
      });
    }

    if (fastFoodLoad >= 3) {
      suggestions.push({
        title: 'Cut the junk drag',
        detail: 'Fast food is high this week. Replacing just two meals with cleaner food improves both recovery and your travel budget runway.',
        priority: 'medium',
      });
    }

    if (weeklyActiveMinutes < 180) {
      suggestions.push({
        title: 'Raise your adventure base',
        detail: 'Your weekly movement is light for trekking goals. Aim for 30 to 45 extra minutes across walking, stairs, badminton, or swimming.',
        priority: 'medium',
      });
    }

    if (!suggestions.length) {
      suggestions.push({
        title: 'Momentum looks clean',
        detail: 'Your current mix is balanced. Hold hydration, keep movement consistent, and use meditation to protect your mental energy.',
        priority: 'low',
      });
    }

    const goalInsights = goals.map((goal) => this.buildGoalInsight(goal, {
      weeklyActiveMinutes,
      averageWater,
      averageMeditation,
      averageMood,
      fastFoodLoad,
    }));

    return {
      coachName: 'Astra',
      coachReply: this.buildCoachReply({
        userName: request.userName || 'friend',
        latestEntry,
        suggestions,
        goalInsights,
        ask: request.ask,
      }),
      summary: {
        weeklyActiveMinutes,
        averageWater: Number(averageWater.toFixed(2)),
        averageMeditation: Number(averageMeditation.toFixed(1)),
        averageMood: Number(averageMood.toFixed(1)),
        averageHeadache: Number(averageHeadache.toFixed(1)),
        recoveryScore: this.scoreRecovery({ latestEntry, averageWater, averageMeditation, fastFoodLoad }),
        travelReadiness: this.scoreTravelReadiness({ weeklyActiveMinutes, averageWater, averageMood }),
      },
      suggestions,
      goalInsights,
      recentEntries,
    };
  }

  private normalizeEntry(entry: WellnessEntryDto): NormalizedEntry {
    const safeNumber = (value: unknown, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    return {
      date: entry.date || new Date().toISOString().slice(0, 10),
      runningMinutes: safeNumber(entry.runningMinutes),
      meditationMinutes: safeNumber(entry.meditationMinutes),
      waterLiters: safeNumber(entry.waterLiters),
      headacheLevel: safeNumber(entry.headacheLevel),
      exerciseMinutes: safeNumber(entry.exerciseMinutes),
      fastFoodServings: safeNumber(entry.fastFoodServings),
      cricketMinutes: safeNumber(entry.cricketMinutes),
      footballMinutes: safeNumber(entry.footballMinutes),
      badmintonMinutes: safeNumber(entry.badmintonMinutes),
      swimmingMinutes: safeNumber(entry.swimmingMinutes),
      moodScore: safeNumber(entry.moodScore, 7),
      notes: String(entry.notes || '').trim(),
    };
  }

  private normalizeGoal(goal: TravelGoalDto): NormalizedGoal {
    const budget = Number(goal.budget);
    return {
      id: goal.id || goal.title || `goal-${Math.random().toString(36).slice(2, 8)}`,
      title: goal.title || 'Travel goal',
      location: goal.location || 'Somewhere beautiful',
      targetMonth: goal.targetMonth || 'Flexible',
      budget: Number.isFinite(budget) ? budget : 0,
      budgetLabel: goal.budgetLabel || this.formatCurrency(Number.isFinite(budget) ? budget : 0),
      vibe: goal.vibe || 'More sunlight, more stamina, more memories',
    };
  }

  private totalMovement(entry: NormalizedEntry) {
    return entry.runningMinutes
      + entry.exerciseMinutes
      + entry.cricketMinutes
      + entry.footballMinutes
      + entry.badmintonMinutes
      + entry.swimmingMinutes;
  }

  private average(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private scoreRecovery({ latestEntry, averageWater, averageMeditation, fastFoodLoad }: {
    latestEntry: NormalizedEntry;
    averageWater: number;
    averageMeditation: number;
    fastFoodLoad: number;
  }) {
    const base = 65
      + Math.min(averageWater, 3.5) * 8
      + Math.min(averageMeditation, 20) * 0.9
      - latestEntry.headacheLevel * 5
      - fastFoodLoad * 2.5;
    return Math.max(10, Math.min(98, Math.round(base)));
  }

  private scoreTravelReadiness({ weeklyActiveMinutes, averageWater, averageMood }: {
    weeklyActiveMinutes: number;
    averageWater: number;
    averageMood: number;
  }) {
    const base = 35
      + Math.min(weeklyActiveMinutes, 360) * 0.12
      + Math.min(averageWater, 3.5) * 8
      + Math.min(averageMood, 10) * 3;
    return Math.max(15, Math.min(99, Math.round(base)));
  }

  private buildGoalInsight(goal: NormalizedGoal, stats: {
    weeklyActiveMinutes: number;
    averageWater: number;
    averageMeditation: number;
    averageMood: number;
    fastFoodLoad: number;
  }) {
    const monthsLeft = this.monthsUntil(goal.targetMonth);
    const monthlyBudgetTarget = monthsLeft != null && monthsLeft > 0
      ? Math.round(goal.budget / monthsLeft)
      : null;

    let readiness = 55;
    if (/hampta/i.test(goal.title)) {
      readiness = Math.max(20, Math.min(98, Math.round(
        30 + stats.weeklyActiveMinutes * 0.18 + stats.averageWater * 9 + stats.averageMood * 2,
      )));
    } else {
      readiness = Math.max(20, Math.min(98, Math.round(
        40 + stats.averageMood * 3 + stats.averageMeditation * 0.7 + Math.max(0, 14 - stats.fastFoodLoad),
      )));
    }

    const nextAction = /hampta/i.test(goal.title)
      ? stats.weeklyActiveMinutes < 240
        ? 'Add two incline walks or stair sessions this week to make the trek feel easier.'
        : 'Your movement base is improving. Layer one longer endurance day each week.'
      : monthlyBudgetTarget
        ? `If you reserve about ${this.formatCurrency(monthlyBudgetTarget)} each month, this trip becomes easier to plan without stress.`
        : 'Treat this as a long-game dream goal and trim random impulse spending to build the travel fund.';

    return {
      id: goal.id,
      title: goal.title,
      location: goal.location,
      targetMonth: goal.targetMonth,
      budget: goal.budget,
      budgetLabel: goal.budgetLabel,
      vibe: goal.vibe,
      readiness,
      nextAction,
      monthlyBudgetTarget,
      monthlyBudgetLabel: monthlyBudgetTarget != null ? this.formatCurrency(monthlyBudgetTarget) : null,
    };
  }

  private buildCoachReply({ userName, latestEntry, suggestions, goalInsights, ask }: {
    userName: string;
    latestEntry: NormalizedEntry;
    suggestions: Array<{ title: string; detail: string }>;
    goalInsights: Array<{ title: string; readiness: number; nextAction: string }>;
    ask?: string;
  }) {
    const lead = suggestions[0];
    const topGoal = [...goalInsights].sort((left, right) => right.readiness - left.readiness)[0];

    let reply = `${userName}, your body is giving me a clear signal today. ${lead.title}: ${lead.detail}`;

    if (topGoal) {
      reply += ` For ${topGoal.title}, your readiness is ${topGoal.readiness} out of 100. ${topGoal.nextAction}`;
    }

    if (ask) {
      const lowerAsk = ask.toLowerCase();
      if (lowerAsk.includes('headache')) {
        reply += ` Since your headache score is ${latestEntry.headacheLevel}, choose water, a dark room break, and gentle movement before any hard workout.`;
      } else if (lowerAsk.includes('travel')) {
        reply += ' Your travel goals get easier when your weekly movement stays consistent and your random food spend comes down.';
      } else if (lowerAsk.includes('exercise')) {
        reply += ' Your best training move tomorrow is moderate intensity with enough recovery rather than trying to overcompensate in one session.';
      }
    }

    return reply;
  }

  private formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  }

  private monthsUntil(targetMonth: string) {
    if (!targetMonth || /flexible/i.test(targetMonth)) return null;
    const parsed = new Date(`${targetMonth}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    const now = new Date();
    const months = (parsed.getFullYear() - now.getFullYear()) * 12 + (parsed.getMonth() - now.getMonth());
    return Math.max(months + 1, 1);
  }
}