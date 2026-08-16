import { daysUntil, formatTripDate, tripPlaceQuery } from './tripEvent';

export const BUDGET_CATEGORIES = [
  { id: 'hotels', label: 'Hotels', emoji: '🏨' },
  { id: 'food', label: 'Food', emoji: '🍽️' },
  { id: 'travel', label: 'Travel', emoji: '🚕' },
  { id: 'activities', label: 'Activities', emoji: '🎟️' },
  { id: 'other', label: 'Other', emoji: '🧾' },
];

const EMPTY_BUDGET = {
  hotels: 0,
  food: 0,
  travel: 0,
  activities: 0,
  other: 0,
  currency: 'INR',
};

export function parseBudgetEstimate(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ...EMPTY_BUDGET };
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        hotels: Number(parsed.hotels || 0) || 0,
        food: Number(parsed.food || 0) || 0,
        travel: Number(parsed.travel || 0) || 0,
        activities: Number(parsed.activities || 0) || 0,
        other: Number(parsed.other || 0) || 0,
        currency: String(parsed.currency || 'INR'),
      };
    }
  } catch (_) {
    const amount = Number(String(text).replace(/[^\d.]/g, '')) || 0;
    return { ...EMPTY_BUDGET, other: amount };
  }
  return { ...EMPTY_BUDGET };
}

export function stringifyBudgetEstimate(budget) {
  return JSON.stringify({
    hotels: Number(budget?.hotels || 0) || 0,
    food: Number(budget?.food || 0) || 0,
    travel: Number(budget?.travel || 0) || 0,
    activities: Number(budget?.activities || 0) || 0,
    other: Number(budget?.other || 0) || 0,
    currency: String(budget?.currency || 'INR'),
  });
}

export function budgetTotal(budget) {
  return BUDGET_CATEGORIES.reduce((sum, item) => sum + (Number(budget?.[item.id] || 0) || 0), 0);
}

export function formatMoney(value, currency = 'INR') {
  const amount = Number(value || 0) || 0;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch (_) {
    return `${currency} ${Math.round(amount)}`;
  }
}

const WEATHER_CODE = {
  0: { label: 'Clear sky', emoji: '☀️' },
  1: { label: 'Mostly clear', emoji: '🌤️' },
  2: { label: 'Partly cloudy', emoji: '⛅' },
  3: { label: 'Overcast', emoji: '☁️' },
  45: { label: 'Fog', emoji: '🌫️' },
  48: { label: 'Rime fog', emoji: '🌫️' },
  51: { label: 'Light drizzle', emoji: '🌦️' },
  53: { label: 'Drizzle', emoji: '🌦️' },
  55: { label: 'Heavy drizzle', emoji: '🌧️' },
  61: { label: 'Light rain', emoji: '🌧️' },
  63: { label: 'Rain', emoji: '🌧️' },
  65: { label: 'Heavy rain', emoji: '🌧️' },
  71: { label: 'Light snow', emoji: '🌨️' },
  73: { label: 'Snow', emoji: '❄️' },
  75: { label: 'Heavy snow', emoji: '❄️' },
  80: { label: 'Rain showers', emoji: '🌦️' },
  81: { label: 'Showers', emoji: '🌧️' },
  82: { label: 'Heavy showers', emoji: '⛈️' },
  95: { label: 'Thunderstorm', emoji: '⛈️' },
  96: { label: 'Storm + hail', emoji: '⛈️' },
  99: { label: 'Severe storm', emoji: '⛈️' },
};

export function describeWeather(code) {
  return WEATHER_CODE[Number(code)] || { label: 'Weather', emoji: '🌡️' };
}

export { daysUntil, formatTripDate, tripPlaceQuery };
