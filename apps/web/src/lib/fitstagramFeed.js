
function fmtPace(minPerKm) {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return null;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

function sortEntriesDesc(entries = []) {
  return [...entries]
    .filter((e) => e && e.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function computeStreak(entries, fieldCheck) {
  const days = sortEntriesDesc(entries).filter(fieldCheck).map((e) => String(e.date));
  if (!days.length) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i += 1) {
    const prev = new Date(days[i - 1]);
    const cur = new Date(days[i]);
    const diff = Math.round((prev.getTime() - cur.getTime()) / 86400000);
    if (diff === 1) streak += 1;
    else break;
  }
  return streak;
}

function rankedRuns(entries) {
  return sortEntriesDesc(entries)
    .filter((e) => Number(e.runningDistanceKm || 0) >= 2 && Number(e.runningMinutes || 0) > 0)
    .map((e) => ({
      date: e.date,
      distanceKm: Number(e.runningDistanceKm),
      minutes: Number(e.runningMinutes),
      pace: Number(e.runningMinutes) / Number(e.runningDistanceKm),
      speed: Number(e.runningDistanceKm) / (Number(e.runningMinutes) / 60),
    }));
}

function buildActivityPosts(authorId, authorName, entries) {
  const posts = [];
  const recent = sortEntriesDesc(entries).slice(0, 45);

  recent.forEach((entry) => {
    const date = String(entry.date || '');
    const runKm = Number(entry.runningDistanceKm || 0);
    const runMin = Number(entry.runningMinutes || 0);
    if (runKm > 0 && runMin > 0) {
      const pace = runMin / runKm;
      const speed = runKm / (runMin / 60);
      const id = `fit-${authorId}-run-${date}`;
      posts.push({
        id,
        authorId,
        authorName,
        kind: 'activity',
        activityType: 'Running',
        sport: 'running',
        title: `${authorName} logged a run`,
        body: `${runKm.toFixed(1)} km in ${runMin} min · ${fmtPace(pace) || 'steady pace'} · ${speed.toFixed(1)} km/h`,
        createdAt: `${date}T18:00:00.000Z`,
        comments: [],
        metrics: { distanceKm: runKm, minutes: runMin, pace, speed },
        notifiable: true,
      });
    }

    const sports = [
      { key: 'badmintonMinutes', sport: 'badminton', label: 'Badminton', activityType: 'Badminton' },
      { key: 'cyclingMinutes', sport: 'cycling', label: 'Cycling', activityType: 'Cycling' },
      { key: 'walkingMinutes', sport: 'walking', label: 'Walking', activityType: 'Walking', distKey: 'walkingDistanceKm' },
      { key: 'swimmingMinutes', sport: 'swimming', label: 'Swimming', activityType: 'Swimming' },
      { key: 'footballMinutes', sport: 'football', label: 'Football', activityType: 'Football' },
      { key: 'exerciseMinutes', sport: 'strength', label: 'Strength', activityType: 'Strength' },
      { key: 'yogaMinutes', sport: 'yoga', label: 'Yoga', activityType: 'Yoga' },
    ];

    sports.forEach(({ key, sport, label, activityType, distKey }) => {
      const mins = Number(entry[key] || 0);
      if (mins <= 0) return;
      const dist = distKey ? Number(entry[distKey] || 0) : 0;
      const id = `fit-${authorId}-${sport}-${date}`;
      const body = dist > 0
        ? `${dist.toFixed(1)} km · ${mins} min ${label.toLowerCase()} session`
        : `${mins} min ${label.toLowerCase()} session — great consistency`;
      posts.push({
        id,
        authorId,
        authorName,
        kind: 'activity',
        activityType,
        sport,
        title: `${authorName} finished ${label}`,
        body,
        createdAt: `${date}T17:30:00.000Z`,
        comments: [],
        metrics: { minutes: mins, distanceKm: dist || null },
        notifiable: true,
      });
    });
  });

  return posts;
}

function buildAchievementPosts(authorId, authorName, entries) {
  const posts = [];
  const sorted = sortEntriesDesc(entries);
  if (!sorted.length) return posts;

  const latest = sorted[0];
  const latestDate = String(latest.date || '');

  const runStreak = computeStreak(entries, (e) => Number(e.runningDistanceKm || 0) > 0);
  if (runStreak >= 3 && Number(latest.runningDistanceKm || 0) > 0) {
    const id = `fit-${authorId}-run-streak-${latestDate}`;
    posts.push({
      id,
      authorId,
      authorName,
      kind: 'streak',
      activityType: 'Running streak',
      sport: 'running',
      title: `${authorName} is on a ${runStreak}-day running streak`,
      body: `Momentum is building — ${runStreak} days in a row with a run logged. Buddies are watching.`,
      createdAt: `${latestDate}T19:10:00.000Z`,
      comments: [],
      notifiable: true,
    });
  }

  const badmintonStreak = computeStreak(entries, (e) => Number(e.badmintonMinutes || 0) > 0);
  if (badmintonStreak >= 3 && Number(latest.badmintonMinutes || 0) > 0) {
    const id = `fit-${authorId}-badminton-streak-${latestDate}`;
    posts.push({
      id,
      authorId,
      authorName,
      kind: 'streak',
      activityType: 'Badminton streak',
      sport: 'badminton',
      title: `${authorName} made a ${badmintonStreak}-day badminton streak`,
      body: `${badmintonStreak} days of court time in a row. Sharp reflexes and steady wellness.`,
      createdAt: `${latestDate}T19:05:00.000Z`,
      comments: [],
      notifiable: true,
    });
  }

  const runs = rankedRuns(entries);
  if (runs.length && Number(latest.runningDistanceKm || 0) > 0) {
    const maxDist = Math.max(...runs.map((r) => r.distanceKm));
    if (Number(latest.runningDistanceKm) >= maxDist && maxDist >= 3) {
      const id = `fit-${authorId}-pr-distance-${latestDate}`;
      posts.push({
        id,
        authorId,
        authorName,
        kind: 'record',
        activityType: 'Personal record',
        sport: 'running',
        title: `${authorName} broke their max distance record`,
        body: `New longest run: ${maxDist.toFixed(1)} km. Previous bests are officially in the rear-view.`,
        createdAt: `${latestDate}T19:20:00.000Z`,
        comments: [],
        metrics: { distanceKm: maxDist },
        notifiable: true,
      });
    }

    const sortedByPace = [...runs].sort((a, b) => a.pace - b.pace);
    const latestRun = runs.find((r) => r.date === latestDate);
    if (latestRun && sortedByPace.length >= 2) {
      const paceRank = sortedByPace.findIndex((r) => r.date === latestDate) + 1;
      if (paceRank === 2) {
        const id = `fit-${authorId}-pace-2nd-${latestDate}`;
        posts.push({
          id,
          authorId,
          authorName,
          kind: 'pace',
          activityType: 'Fast run',
          sport: 'running',
          title: `${authorName} just hit their second fastest run`,
          body: `${latestRun.distanceKm.toFixed(1)} km at ${fmtPace(latestRun.pace)} — only one session was quicker all-time.`,
          createdAt: `${latestDate}T19:15:00.000Z`,
          comments: [],
          metrics: latestRun,
          notifiable: true,
        });
      } else if (paceRank === 1 && latestRun.distanceKm >= 2) {
        const id = `fit-${authorId}-pace-pr-${latestDate}`;
        posts.push({
          id,
          authorId,
          authorName,
          kind: 'pace',
          activityType: 'Fastest run',
          sport: 'running',
          title: `${authorName} set a new fastest pace`,
          body: `${latestRun.distanceKm.toFixed(1)} km at ${fmtPace(latestRun.pace)} — a new personal speed benchmark.`,
          createdAt: `${latestDate}T19:18:00.000Z`,
          comments: [],
          metrics: latestRun,
          notifiable: true,
        });
      }
    }
  }

  return posts;
}

export function buildPostsForUser(authorId, authorName, entries = []) {
  const activity = buildActivityPosts(authorId, authorName, entries);
  const achievements = buildAchievementPosts(authorId, authorName, entries);
  const byId = new Map();
  [...activity, ...achievements].forEach((post) => {
    if (!byId.has(post.id)) byId.set(post.id, post);
  });
  return [...byId.values()];
}

export function rankPostsForViewer(posts, viewerId, viewedIds = new Set()) {
  return [...posts]
    .map((post) => ({
      ...post,
      seen: viewedIds.has(post.id),
    }))
    .sort((left, right) => {
      const leftUnseen = left.seen ? 0 : 1;
      const rightUnseen = right.seen ? 0 : 1;
      if (rightUnseen !== leftUnseen) return rightUnseen - leftUnseen;
      return String(right.createdAt).localeCompare(String(left.createdAt));
    });
}

