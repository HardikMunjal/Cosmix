export class WellnessEntryDto {
  date?: string;
  runningMinutes?: number;
  meditationMinutes?: number;
  waterLiters?: number;
  headacheLevel?: number;
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

export class CoachRequestDto {
  userName?: string;
  latestEntry?: WellnessEntryDto;
  entries?: WellnessEntryDto[];
  goals?: TravelGoalDto[];
  ask?: string;
}