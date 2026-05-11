#!/usr/bin/env node
// Fetches Strava activities, aggregates into the shape strava.html expects,
// and writes assets/strava-data.json. Runs daily via .github/workflows/strava-sync.yml.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const OUT_PATH = resolve('assets/strava-data.json');
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;
if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
  console.error('Missing Strava secrets. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN.');
  process.exit(1);
}

async function refreshAccessToken() {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: STRAVA_REFRESH_TOKEN,
    }),
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

async function fetchActivities(token, afterEpoch) {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=200&page=${page}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Activities fetch failed: ${r.status} ${await r.text()}`);
    const batch = await r.json();
    out.push(...batch);
    if (batch.length < 200) break;
  }
  return out;
}

function categorize(type) {
  if (/Ride/.test(type)) return 'Ride';
  if (/Run/.test(type))  return 'Run';
  if (type === 'Swim')   return 'Swim';
  return 'Other';
}

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function fmtPacePerKm(secondsPerKm) {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2,'0')} / km`;
}

function fmtPacePer100m(secondsPer100m) {
  const m = Math.floor(secondsPer100m / 60);
  const s = Math.round(secondsPer100m % 60);
  return `${m}:${String(s).padStart(2,'0')} / 100m`;
}

function avgDisplay(activity, category) {
  const distKm = activity.distance / 1000;
  const moveSec = activity.moving_time;
  if (category === 'Ride') {
    const kmh = distKm > 0 ? (distKm / (moveSec / 3600)) : 0;
    return `${kmh.toFixed(1)} km/h`;
  }
  if (category === 'Run') {
    return distKm > 0 ? fmtPacePerKm(moveSec / distKm) : '—';
  }
  if (category === 'Swim') {
    return distKm > 0 ? fmtPacePer100m(moveSec / (distKm * 10)) : '—';
  }
  return '—';
}

function heatmapLevel(distKm) {
  if (distKm <= 0)  return 0;
  if (distKm < 10)  return 1;
  if (distKm < 20)  return 2;
  if (distKm < 40)  return 3;
  if (distKm < 60)  return 4;
  return 5;
}

function isoDay(date) { return date.toISOString().slice(0, 10); }

function build(activities) {
  const now = new Date();
  const yearAgo = new Date(now); yearAgo.setDate(now.getDate() - 364);

  // Totals (last 12 months)
  let totalDistKm = 0, totalMoveSec = 0, totalElevM = 0;
  let countByCat = { Ride: 0, Run: 0, Swim: 0, Other: 0 };
  let distByCat  = { Ride: 0, Run: 0, Swim: 0, Other: 0 };

  // Heatmap: 365 days oldest→newest
  const heatmapMap = new Map();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    heatmapMap.set(isoDay(d), 0);
  }

  // Weekly buckets (last 26 weeks), keyed by ISO week-start (Monday)
  const weekKeys = [];
  for (let i = 25; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i * 7);
    // shift to Monday
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    weekKeys.push(isoDay(d));
  }
  const weekIdx = new Map(weekKeys.map((k, i) => [k, i]));
  const weekly = {
    labels: weekKeys.map((_, i) => `W${i + 1}`),
    ride: Array(26).fill(0),
    run:  Array(26).fill(0),
    swim: Array(26).fill(0),
  };

  // Pace by month: only Run, last 12 months
  const monthBuckets = []; // [{ label, distKm, moveSec }]
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABELS[d.getMonth()], distKm: 0, moveSec: 0 });
  }
  const monthIdx = new Map(monthBuckets.map((b, i) => [b.key, i]));

  for (const a of activities) {
    const start = new Date(a.start_date_local || a.start_date);
    if (start < yearAgo) continue;
    const cat = categorize(a.type);
    const distKm  = a.distance / 1000;
    const moveSec = a.moving_time || 0;
    const elevM   = a.total_elevation_gain || 0;

    totalDistKm += distKm;
    totalMoveSec += moveSec;
    totalElevM  += elevM;
    countByCat[cat]++;
    distByCat[cat] += distKm;

    // heatmap
    const dayKey = isoDay(start);
    if (heatmapMap.has(dayKey)) heatmapMap.set(dayKey, heatmapMap.get(dayKey) + distKm);

    // weekly
    const wd = new Date(start);
    const dow = (wd.getDay() + 6) % 7;
    wd.setDate(wd.getDate() - dow);
    const wkKey = isoDay(wd);
    if (weekIdx.has(wkKey)) {
      const i = weekIdx.get(wkKey);
      if (cat === 'Ride')      weekly.ride[i] += distKm;
      else if (cat === 'Run')  weekly.run[i]  += distKm;
      else if (cat === 'Swim') weekly.swim[i] += distKm;
    }

    // monthly pace (runs only)
    if (cat === 'Run') {
      const mk = `${start.getFullYear()}-${start.getMonth()}`;
      if (monthIdx.has(mk)) {
        const b = monthBuckets[monthIdx.get(mk)];
        b.distKm  += distKm;
        b.moveSec += moveSec;
      }
    }
  }

  // round weekly
  weekly.ride = weekly.ride.map(v => +v.toFixed(1));
  weekly.run  = weekly.run.map(v  => +v.toFixed(1));
  weekly.swim = weekly.swim.map(v => +v.toFixed(1));

  // heatmap as array
  const heatmap = [...heatmapMap.entries()]
    .sort(([a],[b]) => a < b ? -1 : 1)
    .map(([date, dist]) => ({
      date,
      distanceKm: +dist.toFixed(1),
      level: heatmapLevel(dist),
    }));

  // mix (% by distance)
  const totalForMix = Object.values(distByCat).reduce((s, v) => s + v, 0) || 1;
  const mix = [
    { label: 'Cycling',  value: Math.round(distByCat.Ride  / totalForMix * 100), color: '#FF4F1F' },
    { label: 'Running',  value: Math.round(distByCat.Run   / totalForMix * 100), color: '#00D9FF' },
    { label: 'Swimming', value: Math.round(distByCat.Swim  / totalForMix * 100), color: '#B8B0FF' },
    { label: 'Other',    value: Math.round(distByCat.Other / totalForMix * 100), color: '#5A6485' },
  ];

  // paceByMonth: min/km, null for empty months
  const paceByMonth = {
    labels: monthBuckets.map(b => b.label),
    data:   monthBuckets.map(b => b.distKm > 0 ? +(b.moveSec / b.distKm / 60).toFixed(2) : null),
  };

  // recent: 8 most recent
  const recent = activities
    .slice()
    .sort((a, b) => new Date(b.start_date) - new Date(a.start_date))
    .slice(0, 8)
    .map(a => {
      const start = new Date(a.start_date_local || a.start_date);
      const cat = categorize(a.type);
      return {
        date: `${MONTH_LABELS[start.getMonth()]} ${start.getDate()}`,
        name: a.name || '(untitled)',
        type: cat === 'Other' ? 'Ride' : cat,
        distanceKm: +(a.distance / 1000).toFixed(1),
        movingTime: fmtDuration(a.moving_time || 0),
        elevationM: cat === 'Swim' ? null : Math.round(a.total_elevation_gain || 0),
        avgDisplay: avgDisplay(a, cat),
      };
    });

  const totalActivities = Object.values(countByCat).reduce((s, v) => s + v, 0);

  return {
    lastSync: new Date().toISOString(),
    totals: {
      distanceKm: Math.round(totalDistKm),
      movingHours: Math.round(totalMoveSec / 3600),
      elevationM: Math.round(totalElevM),
      activityCount: totalActivities,
    },
    mix,
    weekly,
    heatmap,
    paceByMonth,
    recent,
  };
}

(async () => {
  const token = await refreshAccessToken();
  const after = Math.floor((Date.now() - 365 * 24 * 3600 * 1000) / 1000);
  const activities = await fetchActivities(token, after);
  const data = build(activities);

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT_PATH} (${activities.length} activities, ${data.totals.distanceKm} km, last sync ${data.lastSync})`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
