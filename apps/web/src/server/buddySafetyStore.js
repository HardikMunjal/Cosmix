import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Datastore from '@seald-io/nedb';
import {
  evaluateTripProgress,
  haversineKm,
} from '../lib/buddySafetyGeo';
import { normalizePhoneE164 } from '../lib/buddySafetyLinks';
import { dispatchTripAlerts, notifyTripStarted, resolveAppOrigin } from './buddySafetyNotify';
import { getSafetyProfile } from './buddySafetyProfileStore';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'buddy-safety-trips.db');

let dbPromise = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

async function initDb() {
  ensureDataDir();
  const db = new Datastore({
    filename: DB_FILE,
    autoload: true,
    timestampData: false,
  });
  if (db.autoloadPromise) {
    await db.autoloadPromise;
  }
  await db.ensureIndexAsync({ fieldName: 'id', unique: true });
  await db.ensureIndexAsync({ fieldName: 'travellerId' });
  await db.ensureIndexAsync({ fieldName: 'watcherUsernameKey' });
  await db.ensureIndexAsync({ fieldName: 'shareCode', unique: true });
  await db.ensureIndexAsync({ fieldName: 'shareToken', unique: true });
  return db;
}

async function getDb() {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

function newId() {
  return crypto.randomUUID();
}

function shortShareCode() {
  return crypto.randomBytes(4).toString('hex');
}

function shareToken() {
  return crypto.randomBytes(18).toString('hex');
}

function normalizeUsernameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeTrip(trip) {
  if (!trip) return null;
  const { _id, ...rest } = trip;
  return rest;
}

function sanitizePublicTrip(trip) {
  if (!trip) return null;
  return {
    id: trip.id,
    shareCode: trip.shareCode,
    title: trip.title,
    travellerName: trip.travellerName,
    travellerUsername: trip.travellerUsername,
    destination: trip.destination,
    origin: trip.origin,
    plannedDistanceKm: trip.plannedDistanceKm,
    routePolyline: trip.routePolyline,
    status: trip.status,
    pings: (trip.pings || []).map((p) => ({
      lat: p.lat,
      lng: p.lng,
      ts: p.ts,
      distanceToDest: p.distanceToDest,
      distanceFromStart: p.distanceFromStart,
      progressPct: p.progressPct,
    })),
    alerts: (trip.alerts || []).map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      km: a.km,
      at: a.at,
      severity: a.severity,
    })),
    notifyEveryKm: trip.notifyEveryKm,
    shareDurationMinutes: trip.shareDurationMinutes,
    shareEndsAt: trip.shareEndsAt,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

async function fetchRoutePolyline(origin, destination) {
  if (!origin?.lat || !destination?.lat) return [];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => ({}));
    const coords = data?.routes?.[0]?.geometry?.coordinates || [];
    return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch (_) {
    return [];
  }
}

export async function listTripsForUser(user) {
  const db = await getDb();
  const userId = String(user.id || '').trim();
  const usernameKey = normalizeUsernameKey(user.username);
  const rows = await db.findAsync({
    $or: [
      { travellerId: userId },
      { watcherId: userId },
      ...(usernameKey ? [{ watcherUsernameKey: usernameKey }] : []),
    ],
  }).sort({ updatedAt: -1 }).execAsync();

  for (const row of rows) {
    if (!row.shareToken) {
      row.shareToken = shareToken();
      await db.updateAsync({ id: row.id }, { $set: { shareToken: row.shareToken } }, {});
    }
  }

  return rows.map(sanitizeTrip);
}

export async function getTripById(tripId, user) {
  const db = await getDb();
  const trip = sanitizeTrip(await db.findOneAsync({ id: String(tripId) }).execAsync());
  if (!trip) return null;
  if (!canAccessTrip(trip, user)) return null;
  return trip;
}

export async function getTripByShareToken(token) {
  const db = await getDb();
  const trip = sanitizeTrip(await db.findOneAsync({ shareToken: String(token || '').trim() }).execAsync());
  if (!trip) return null;
  return sanitizePublicTrip(trip);
}

function canAccessTrip(trip, user) {
  const userId = String(user?.id || '').trim();
  const usernameKey = normalizeUsernameKey(user?.username);
  return trip.travellerId === userId
    || trip.watcherId === userId
    || trip.watcherUsernameKey === usernameKey;
}

export async function createTrip(user, payload) {
  const db = await getDb();
  const watcherUsername = String(payload.watcherUsername || '').trim();
  const watcherUsernameKey = normalizeUsernameKey(watcherUsername);
  const watcherPhoneInput = normalizePhoneE164(payload.watcherPhone || '');

  if (!watcherUsernameKey && !watcherPhoneInput) {
    throw new Error('Pick a buddy username or enter a phone number for SMS/WhatsApp alerts.');
  }

  const destination = {
    lat: Number(payload.destination?.lat),
    lng: Number(payload.destination?.lng),
    label: String(payload.destination?.label || 'Destination').trim() || 'Destination',
  };
  if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
    throw new Error('Destination location is required.');
  }

  const origin = payload.origin?.lat != null
    ? {
      lat: Number(payload.origin.lat),
      lng: Number(payload.origin.lng),
      label: String(payload.origin?.label || 'Start').trim() || 'Start',
    }
    : null;

  const plannedDistanceKm = origin
    ? haversineKm(origin, destination)
    : Number(payload.plannedDistanceKm) || 0;

  const routePolyline = origin
    ? await fetchRoutePolyline(origin, destination)
    : [];

  const travellerProfile = await getSafetyProfile(user.id);
  const watcherProfile = payload.watcherId
    ? await getSafetyProfile(payload.watcherId)
    : null;

  const watcherPhone = watcherPhoneInput || normalizePhoneE164(
    watcherProfile?.phone || '',
  );

  const now = Date.now();
  const trip = {
    id: newId(),
    shareCode: shortShareCode(),
    shareToken: shareToken(),
    travellerId: String(user.id),
    travellerName: String(user.name || user.username || 'Traveller'),
    travellerUsername: String(user.username || ''),
    watcherUsername,
    watcherUsernameKey,
    watcherId: String(payload.watcherId || '').trim() || null,
    watcherName: String(payload.watcherName || watcherUsername).trim(),
    title: String(payload.title || 'Trip home').trim() || 'Trip home',
    origin,
    destination,
    plannedDistanceKm: plannedDistanceKm || Number(payload.plannedDistanceKm) || 0,
    routePolyline,
    notifyEveryKm: Math.max(0.5, Number(payload.notifyEveryKm) || 2),
    notifyIntervalMinutes: Math.max(5, Number(payload.notifyIntervalMinutes) || 15),
    stallMinutes: Math.max(3, Number(payload.stallMinutes) || 8),
    shareDurationMinutes: Number(payload.shareDurationMinutes) > 0
      ? Math.max(5, Number(payload.shareDurationMinutes))
      : null,
    shareEndsAt: Number(payload.shareDurationMinutes) > 0
      ? now + Math.max(5, Number(payload.shareDurationMinutes)) * 60 * 1000
      : null,
    watcherPhone,
    watcherNotifySms: payload.watcherNotifySms !== undefined
      ? Boolean(payload.watcherNotifySms)
      : watcherProfile?.notifySms !== false,
    watcherNotifyWhatsApp: payload.watcherNotifyWhatsApp !== undefined
      ? Boolean(payload.watcherNotifyWhatsApp)
      : watcherProfile?.notifyWhatsApp !== false,
    alertChannels: { sms: true, whatsapp: true },
    travellerPhone: travellerProfile?.phone || '',
    status: 'active',
    pings: [],
    alerts: [],
    bestDistanceToDest: null,
    lastMilestoneKm: 0,
    lastProgressAt: now,
    lastStallAlertAt: 0,
    lastIntervalNotifyAt: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db.insertAsync(trip);
  const saved = sanitizeTrip(trip);
  try {
    await notifyTripStarted(saved, { appOrigin: String(payload.appOrigin || '').trim() });
  } catch (error) {
    console.warn('buddy-safety trip start notify failed:', error.message);
  }
  return saved;
}

export async function addTripPing(tripId, user, pingPayload, { appOrigin = '' } = {}) {
  const db = await getDb();
  const trip = sanitizeTrip(await db.findOneAsync({ id: String(tripId) }).execAsync());
  if (!trip) throw new Error('Trip not found.');
  if (trip.travellerId !== String(user.id)) throw new Error('Only the traveller can send location updates.');
  if (trip.status !== 'active') throw new Error('Trip is not active.');

  const ping = {
    lat: Number(pingPayload.lat),
    lng: Number(pingPayload.lng),
    accuracy: Number(pingPayload.accuracy) || null,
    speed: Number(pingPayload.speed) || null,
    heading: Number(pingPayload.heading) || null,
    ts: Number(pingPayload.ts) || Date.now(),
  };
  if (!Number.isFinite(ping.lat) || !Number.isFinite(ping.lng)) {
    throw new Error('Invalid coordinates.');
  }

  if (!trip.origin) {
    trip.origin = {
      lat: ping.lat,
      lng: ping.lng,
      label: String(pingPayload.originLabel || 'Trip start').trim() || 'Trip start',
    };
    trip.plannedDistanceKm = haversineKm(trip.origin, trip.destination);
    trip.routePolyline = await fetchRoutePolyline(trip.origin, trip.destination);
  }

  const evaluation = evaluateTripProgress(trip, ping);
  const enrichedPing = {
    ...ping,
    distanceToDest: evaluation.distanceToDest,
    distanceFromStart: evaluation.distanceFromStart,
    progressPct: evaluation.progressPct,
  };

  trip.pings = [...(trip.pings || []), enrichedPing].slice(-600);
  trip.bestDistanceToDest = evaluation.bestDistanceToDest;
  trip.lastMilestoneKm = evaluation.lastMilestoneKm;
  trip.lastProgressAt = evaluation.lastProgressAt;
  trip.lastStallAlertAt = evaluation.lastStallAlertAt;
  trip.lastIntervalNotifyAt = evaluation.lastIntervalNotifyAt;
  trip.status = evaluation.status;
  trip.updatedAt = Date.now();

  const newAlerts = (evaluation.events || []).map((event) => ({
    id: newId(),
    ...event,
    acknowledged: false,
  }));
  if (newAlerts.length) {
    trip.alerts = [...(trip.alerts || []), ...newAlerts].slice(-80);
  }

  await db.updateAsync({ id: trip.id }, { $set: trip }, {});

  const notifyResult = await dispatchTripAlerts(trip, newAlerts, { appOrigin });

  return {
    trip: sanitizeTrip(trip),
    events: newAlerts,
    notify: notifyResult,
  };
}

export async function endTrip(tripId, user) {
  const db = await getDb();
  const trip = sanitizeTrip(await db.findOneAsync({ id: String(tripId) }).execAsync());
  if (!trip) throw new Error('Trip not found.');
  if (trip.travellerId !== String(user.id)) throw new Error('Only the traveller can end the trip.');
  trip.status = 'completed';
  trip.updatedAt = Date.now();
  await db.updateAsync({ id: trip.id }, { $set: trip }, {});
  return sanitizeTrip(trip);
}

export async function acknowledgeAlert(tripId, alertId, user) {
  const db = await getDb();
  const trip = sanitizeTrip(await db.findOneAsync({ id: String(tripId) }).execAsync());
  if (!trip || !canAccessTrip(trip, user)) throw new Error('Trip not found.');
  trip.alerts = (trip.alerts || []).map((alert) => (
    alert.id === alertId ? { ...alert, acknowledged: true } : alert
  ));
  trip.updatedAt = Date.now();
  await db.updateAsync({ id: trip.id }, { $set: trip }, {});
  return sanitizeTrip(trip);
}

export async function linkWatcherToTrip(tripId, watcherUser) {
  const db = await getDb();
  const trip = sanitizeTrip(await db.findOneAsync({ id: String(tripId) }).execAsync());
  if (!trip) return null;
  const usernameKey = normalizeUsernameKey(watcherUser.username);
  if (trip.watcherUsernameKey !== usernameKey && trip.watcherId !== watcherUser.id) {
    return null;
  }
  if (!trip.watcherId) {
    trip.watcherId = String(watcherUser.id);
    trip.watcherName = String(watcherUser.name || watcherUser.username);
    trip.updatedAt = Date.now();
    await db.updateAsync({ id: trip.id }, { $set: trip }, {});
  }
  return sanitizeTrip(trip);
}
