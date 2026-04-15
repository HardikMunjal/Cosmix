export class WellnessEntryDto {
  date?: string;
  runningMinutes?: number;
  runningDistanceKm?: number;
  walkingMinutes?: number;
  walkingDistanceKm?: number;
  meditationMinutes?: number;
  headacheLevel?: number;
  sugarServings?: number;
  whiskyPegs?: number;
  exerciseMinutes?: number;
  fastFoodServings?: number;
  cricketMinutes?: number;
  footballMinutes?: number;
  badmintonMinutes?: number;
  swimmingMinutes?: number;
  moodScore?: number;
  notes?: string;
}

export class TravelGoalDto {
  id?: string;
  title?: string;
  location?: string;
  targetMonth?: string;
  budget?: number;
  budgetLabel?: string;
  vibe?: string;
}

export class CoachConversationTurnDto {
  role?: string;
  text?: string;
  ts?: number;
}

export class CoachRequestDto {
  userName?: string;
  latestEntry?: WellnessEntryDto;
  entries?: WellnessEntryDto[];
  goals?: TravelGoalDto[];
  recentConversation?: CoachConversationTurnDto[];
  preferredLanguage?: string;
  ask?: string;
}