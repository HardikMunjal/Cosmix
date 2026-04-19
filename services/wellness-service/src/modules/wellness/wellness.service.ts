import { Injectable } from '@nestjs/common';
import { CoachConversationTurnDto, CoachRequestDto, TravelGoalDto, WellnessEntryDto } from './dto/coach-request.dto';

type NormalizedEntry = {
  date: string;
  runningMinutes: number;
  runningDistanceKm: number;
  walkingMinutes: number;
  walkingDistanceKm: number;
  meditationMinutes: number;
  headacheLevel: number;
  exerciseMinutes: number;
  yogaMinutes: number;
  fastFoodServings: number;
  sugarServings: number;
  cricketMinutes: number;
  footballMinutes: number;
  badmintonMinutes: number;
  swimmingMinutes: number;
  whiskyPegs: number;
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

type ConversationTurn = {
  role: string;
  text: string;
  ts: number;
};

@Injectable()
export class WellnessService {
  getDefaults() {
    return {
      coach: {
        name: 'Paaji',
        persona: 'A cheerful Punjabi wellness paaji who turns daily habits into practical next steps with warm, jolly coaching.',
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
        moodScore: 7,
      }),
    };
  }

  buildCoachResponse(request: CoachRequestDto) {
    const entries = (request.entries || []).map((entry) => this.normalizeEntry(entry));
    const latestEntry = this.normalizeEntry(request.latestEntry || entries[0] || {});
    const goals = (request.goals || this.getDefaults().goals).map((goal) => this.normalizeGoal(goal));
    const recentConversation = (request.recentConversation || []).map((turn) => this.normalizeConversationTurn(turn));
    const recentEntries = [latestEntry, ...entries.filter((entry) => entry.date !== latestEntry.date)].slice(0, 7);

    const weeklyActiveMinutes = recentEntries.reduce((sum, entry) => sum + this.totalMovement(entry), 0);
    const weeklyRunningKm = recentEntries.reduce((sum, entry) => sum + entry.runningDistanceKm, 0);
    const averageMeditation = this.average(recentEntries.map((entry) => entry.meditationMinutes));
    const averageMood = this.average(recentEntries.map((entry) => entry.moodScore));
    const averageHeadache = this.average(recentEntries.map((entry) => entry.headacheLevel));
    const fastFoodLoad = recentEntries.reduce((sum, entry) => sum + entry.fastFoodServings, 0);

    const suggestions = [];

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
      averageMeditation,
      averageMood,
      fastFoodLoad,
    }));

    return {
      coachName: 'Paaji',
      coachReply: this.buildCoachReply({
        userName: request.userName || 'friend',
        latestEntry,
        suggestions,
        goalInsights,
        recentConversation,
        preferredLanguage: request.preferredLanguage,
        ask: request.ask,
      }),
      summary: {
        weeklyActiveMinutes,
        weeklyRunningKm: Number(weeklyRunningKm.toFixed(1)),
        runningPaceMinPerKm: this.computeRunningPace(latestEntry),
        averageMeditation: Number(averageMeditation.toFixed(1)),
        averageMood: Number(averageMood.toFixed(1)),
        averageHeadache: Number(averageHeadache.toFixed(1)),
        recoveryScore: this.scoreRecovery({ latestEntry, averageMeditation, fastFoodLoad }),
        travelReadiness: this.scoreTravelReadiness({ weeklyActiveMinutes, averageMood }),
        marathonReadiness: this.scoreMarathonReadiness({ weeklyRunningKm, latestEntry, averageMood }),
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
      runningDistanceKm: safeNumber(entry.runningDistanceKm),
      walkingMinutes: safeNumber(entry.walkingMinutes),
      walkingDistanceKm: safeNumber(entry.walkingDistanceKm),
      meditationMinutes: safeNumber(entry.meditationMinutes),
      headacheLevel: safeNumber(entry.headacheLevel),
      exerciseMinutes: safeNumber(entry.exerciseMinutes),
      yogaMinutes: safeNumber(entry.yogaMinutes),
      fastFoodServings: safeNumber(entry.fastFoodServings),
      sugarServings: safeNumber(entry.sugarServings),
      cricketMinutes: safeNumber(entry.cricketMinutes),
      footballMinutes: safeNumber(entry.footballMinutes),
      badmintonMinutes: safeNumber(entry.badmintonMinutes),
      swimmingMinutes: safeNumber(entry.swimmingMinutes),
      whiskyPegs: safeNumber(entry.whiskyPegs),
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

  private normalizeConversationTurn(turn: CoachConversationTurnDto): ConversationTurn {
    return {
      role: String(turn.role || 'user').trim().toLowerCase() || 'user',
      text: String(turn.text || '').trim(),
      ts: Number.isFinite(Number(turn.ts)) ? Number(turn.ts) : Date.now(),
    };
  }

  private totalMovement(entry: NormalizedEntry) {
    return entry.runningMinutes
      + entry.walkingMinutes
      + entry.exerciseMinutes
      + entry.yogaMinutes
      + entry.cricketMinutes
      + entry.footballMinutes
      + entry.badmintonMinutes
      + entry.swimmingMinutes;
  }

  private computeRunningPace(entry: NormalizedEntry) {
    if (!entry.runningDistanceKm || !entry.runningMinutes) return null;
    return Number((entry.runningMinutes / entry.runningDistanceKm).toFixed(2));
  }

  private average(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private scoreRecovery({ latestEntry, averageMeditation, fastFoodLoad }: {
    latestEntry: NormalizedEntry;
    averageMeditation: number;
    fastFoodLoad: number;
  }) {
    const base = 65
      + Math.min(averageMeditation, 20) * 0.9
      - latestEntry.headacheLevel * 5
      - fastFoodLoad * 2.5;
    return Math.max(10, Math.min(98, Math.round(base)));
  }

  private scoreTravelReadiness({ weeklyActiveMinutes, averageMood }: {
    weeklyActiveMinutes: number;
    averageMood: number;
  }) {
    const base = 35
      + Math.min(weeklyActiveMinutes, 360) * 0.12
      + Math.min(averageMood, 10) * 3;
    return Math.max(15, Math.min(99, Math.round(base)));
  }

  private scoreMarathonReadiness({ weeklyRunningKm, latestEntry, averageMood }: {
    weeklyRunningKm: number;
    latestEntry: NormalizedEntry;
    averageMood: number;
  }) {
    const paceScore = latestEntry.runningDistanceKm > 0 && latestEntry.runningMinutes > 0
      ? Math.max(0, 20 - (latestEntry.runningMinutes / latestEntry.runningDistanceKm - 5.5) * 4)
      : 4;
    const base = 20
      + Math.min(weeklyRunningKm, 35) * 1.6
      + paceScore
      + Math.min(averageMood, 10) * 2.2;
    return Math.max(8, Math.min(99, Math.round(base)));
  }

  private buildGoalInsight(goal: NormalizedGoal, stats: {
    weeklyActiveMinutes: number;
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
        30 + stats.weeklyActiveMinutes * 0.18 + stats.averageMood * 2 + stats.averageMeditation * 0.5,
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

  private buildCoachReply({ userName, latestEntry, suggestions, goalInsights, recentConversation, preferredLanguage, ask }: {
    userName: string;
    latestEntry: NormalizedEntry;
    suggestions: Array<{ title: string; detail: string }>;
    goalInsights: Array<{ title: string; readiness: number; nextAction: string }>;
    recentConversation: ConversationTurn[];
    preferredLanguage?: string;
    ask?: string;
  }) {
    const lead = suggestions[0];
    const topGoal = [...goalInsights].sort((left, right) => right.readiness - left.readiness)[0];
    const wantsHindi = preferredLanguage === 'hi-IN' || this.looksHindi(ask);
    const activityAcknowledgement = this.buildActivityAcknowledgement(ask, latestEntry, wantsHindi);
    const conversationInsight = this.buildConversationInsight(recentConversation, latestEntry, wantsHindi);

    if (wantsHindi) {
      const shortParts = [activityAcknowledgement];

      if (!activityAcknowledgement && lead) {
        shortParts.push(this.toPunjabiNudge(lead.title));
      }

      if (latestEntry.runningDistanceKm > 0 && latestEntry.runningMinutes > 0 && /run|running|jog|bhaag|दौड़|दौड़/i.test(ask || '')) {
        shortParts.push(`Pace ${this.formatMetric(this.computeRunningPace(latestEntry) || 0)} min/km bani.`);
      } else if (conversationInsight) {
        shortParts.push(conversationInsight);
      } else if (topGoal && /marathon|run|running|trek|travel/i.test(ask || '')) {
        shortParts.push(`${topGoal.title} lai readiness ${topGoal.readiness} hai.`);
      }

      return shortParts.filter(Boolean).slice(0, 2).join(' ');
    }

    let reply = activityAcknowledgement || `${userName}, ${lead.title}: ${lead.detail}`;
    if (!activityAcknowledgement && conversationInsight) reply += ` ${conversationInsight}`;
    if (!activityAcknowledgement && topGoal && /marathon|run|running|trek|travel/i.test(ask || '')) {
      reply += ` ${topGoal.title} readiness is ${topGoal.readiness}/100.`;
    }
    return reply;
  }

  private buildConversationInsight(recentConversation: ConversationTurn[], latestEntry: NormalizedEntry, wantsHindi: boolean) {
    if (!recentConversation.length) return null;

    const userTurns = recentConversation
      .filter((turn) => turn.role === 'user' && turn.text)
      .slice(-8);

    if (!userTurns.length) return null;

    const combined = userTurns.map((turn) => turn.text.toLowerCase()).join(' ');
    const themes: string[] = [];

    if (/(run|running|jog|workout|gym|exercise|yoga|asan|swim|swimming|badminton|football|cricket)/.test(combined)) {
      themes.push(`you have been talking a lot about movement, and today you are sitting at ${this.formatMetric(this.totalMovement(latestEntry))} active minutes`);
    }

    if (/(headache|sir dard)/.test(combined)) {
      themes.push(`headache management keeps showing up in our chats, and your current headache level is ${this.formatMetric(latestEntry.headacheLevel)}/10`);
    }

    if (/(mood|stress|anxious|tired|meditat|breath)/.test(combined)) {
      themes.push(`your recent conversations also point to recovery and headspace, so mood ${this.formatMetric(latestEntry.moodScore)}/10 and meditation ${this.formatMetric(latestEntry.meditationMinutes)} mins matter today`);
    }

    if (!themes.length) {
      const recentTopic = userTurns[userTurns.length - 1]?.text;
      return recentTopic
        ? wantsHindi
          ? 'Pichhli gall vi yaad aa ji.'
          : `Paaji is also keeping your recent chat context in mind, especially when you said: "${recentTopic.slice(0, 80)}${recentTopic.length > 80 ? '...' : ''}".`
        : null;
    }

    return wantsHindi
      ? 'Pichhli gallan vi dhyan ch ne ji.'
      : `From your recent chats, Paaji can see ${themes.slice(0, 2).join(' and ')}.`;
  }

  private buildActivityAcknowledgement(ask: string | undefined, latestEntry: NormalizedEntry, wantsHindi: boolean) {
    if (!ask) return null;

    const lowerAsk = ask.toLowerCase();
    const looksLikeTracking = /\b(add|log|track|record|save|update|include|today|activity|did|done|went|played|drank|had)\b/.test(lowerAsk);
    if (!looksLikeTracking) return null;

    const activitySummaries = [
      { terms: ['run', 'running', 'jog', 'jogging'], label: 'running', value: latestEntry.runningMinutes, unit: 'mins' },
      { terms: ['km', 'kilometer', 'kilometers'], label: 'running distance', value: latestEntry.runningDistanceKm, unit: 'km' },
      { terms: ['meditate', 'meditation', 'breathing', 'breathwork'], label: 'meditation', value: latestEntry.meditationMinutes, unit: 'mins' },
      { terms: ['exercise', 'workout', 'gym', 'training'], label: 'exercise', value: latestEntry.exerciseMinutes, unit: 'mins' },
      { terms: ['yoga', 'asan', 'asanas', 'surya namaskar'], label: 'yoga', value: latestEntry.yogaMinutes, unit: 'mins' },
      { terms: ['fast food', 'burger', 'pizza', 'junk food'], label: 'fast food', value: latestEntry.fastFoodServings, unit: 'servings' },
      { terms: ['cricket'], label: 'cricket', value: latestEntry.cricketMinutes, unit: 'mins' },
      { terms: ['football', 'soccer'], label: 'football', value: latestEntry.footballMinutes, unit: 'mins' },
      { terms: ['badminton'], label: 'badminton', value: latestEntry.badmintonMinutes, unit: 'mins' },
      { terms: ['swim', 'swimming'], label: 'swimming', value: latestEntry.swimmingMinutes, unit: 'mins' },
    ]
      .filter((activity) => activity.terms.some((term) => lowerAsk.includes(term)))
      .map((activity) => `${activity.label} ${this.formatMetric(activity.value)} ${activity.unit}`.trim());

    if (!activitySummaries.length) return null;
    return wantsHindi
      ? `Ok ji, ${activitySummaries.join(', ')} daal ditti hai.`
      : `Done, Paaji added ${activitySummaries.join(', ')} to today's activity tracker.`;
  }

  private looksHindi(text: string | undefined) {
    if (!text) return false;
    return /[\u0900-\u097F]/.test(text) || /\b(aaj|paani|pani|dhyan|kasrat|sir dard|bolo|mera|meri|maine|kya|paaji|chup|gallan|haan|aji|bhai)\b/i.test(text);
  }

  private toPunjabiNudge(title: string) {
    if (/Hydration first/i.test(title)) return 'Paani thoda hor pee lo ji.';
    if (/Ease intensity today/i.test(title)) return 'Ajj halka rakho ji.';
    if (/Small reset, big return/i.test(title)) return '10 minute saah te dhyan kar lo ji.';
    if (/Cut the junk drag/i.test(title)) return 'Ajj junk food kat rakho ji.';
    if (/Raise your adventure base/i.test(title)) return 'Thoda hor movement vadhao ji.';
    if (/Momentum looks clean/i.test(title)) return 'Vadhiya ji, ise tarah chalo.';
    return 'Theek chal reha hai ji.';
  }

  private toHinglishTitle(title: string) {
    if (/Hydration first/i.test(title)) return 'Sabse pehle hydration';
    if (/Ease intensity today/i.test(title)) return 'Aaj intensity halka rakho';
    if (/Small reset, big return/i.test(title)) return 'Chhota reset, bada fayda';
    if (/Cut the junk drag/i.test(title)) return 'Junk food thoda kam karo';
    if (/Raise your adventure base/i.test(title)) return 'Movement thoda aur badhao';
    if (/Momentum looks clean/i.test(title)) return 'Momentum sahi chal raha hai';
    return title;
  }

  private toHinglishDetail(detail: string) {
    return detail
      .replace('High headache score means today should be a recovery day: dim lights, easy mobility, and no aggressive cardio.', 'Headache zyada hai, toh aaj recovery day rakho: dim lights, easy mobility, aur hard cardio mat karo.')
      .replace('Do a 10-minute guided breathing block.', '10 minute guided breathing kar lo.')
      .replace('It is the fastest lever here to improve clarity before your evening work or training.', 'Isse evening work ya training se pehle clarity better hogi.')
      .replace('Fast food is high this week.', 'Is hafte fast food thoda zyada ho gaya hai.')
      .replace('Replacing just two meals with cleaner food improves both recovery and your travel budget runway.', 'Sirf do meals clean karne se recovery bhi better hogi aur travel budget bhi help hoga.')
      .replace('Your weekly movement is light for trekking goals.', 'Weekly movement trekking goal ke liye abhi halka hai.')
      .replace('Aim for 30 to 45 extra minutes across walking, stairs, badminton, or swimming.', 'Walking, stairs, badminton ya swimming mein 30 se 45 extra minutes target karo.')
      .replace('Your current mix is balanced.', 'Current routine ka mix kaafi balanced hai.')
      .replace('Hold hydration, keep movement consistent, and use meditation to protect your mental energy.', 'Hydration theek rakho, movement consistent rakho, aur meditation se mental energy protect karo.');
  }

  private formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  }

  private formatMetric(amount: number) {
    return Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(2)));
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