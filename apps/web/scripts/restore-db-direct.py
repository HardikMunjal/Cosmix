import json
import subprocess
from datetime import datetime

NOW = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')

plan = {
    "id": "plan-20260501-507172859058",
    "name": "May 2026",
    "startDate": "2026-05-01",
    "startedAt": "2026-05-01T00:00:00.000Z",
    "endedAt": None,
    "status": "active",
    "updatedAt": NOW,
}

entries = [
    {"date":"2026-05-18","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheSide":"","headacheType":"","headacheLevel":0,"headacheNotes":"","sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":16,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":0,"fastFoodServings":0,"headacheMedicines":"","meditationMinutes":0,"runningDistanceKm":2.1,"trackingStartedAt":None,"walkingDistanceKm":0,"headacheDurationHours":0,"headacheMedicineCount":0},
    {"date":"2026-05-17","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheSide":"","headacheType":"","headacheLevel":0,"headacheNotes":"","sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":90,"fastFoodServings":0,"headacheMedicines":"","meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0,"headacheDurationHours":0,"headacheMedicineCount":0},
    {"date":"2026-05-15","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheSide":"","headacheType":"","headacheLevel":0,"headacheNotes":"","sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":60,"fastFoodServings":0,"headacheMedicines":"","meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0,"headacheDurationHours":0,"headacheMedicineCount":0},
    {"date":"2026-05-13","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheType":"","headacheLevel":0,"headacheNotes":"","sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":63,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":90,"fastFoodServings":0,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":7.5,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-12","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheType":"","headacheLevel":0,"headacheNotes":"","sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":60,"fastFoodServings":0,"meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-10","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheLevel":0,"sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":90,"fastFoodServings":0,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-09","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheLevel":0,"sugarServings":1,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":60,"fastFoodServings":0,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-08","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":2,"yogaMinutes":0,"headacheLevel":0,"sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":60,"fastFoodServings":1,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-07","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheLevel":0,"sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":60,"fastFoodServings":0,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-06","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheLevel":0,"sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":60,"fastFoodServings":0,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-05","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheLevel":0,"sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":80,"fastFoodServings":0,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-02","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheLevel":0,"sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":0,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":60,"fastFoodServings":0,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":0,"trackingStartedAt":None,"walkingDistanceKm":0},
    {"date":"2026-05-01","notes":"","planId":"plan-20260501-507172859058","status":"active","createdAt":"2026-05-18T14:22:10.533Z","moodScore":7,"updatedAt":"2026-05-18T14:22:10.533Z","sleepHours":0,"whiskyPegs":0,"yogaMinutes":0,"headacheLevel":0,"sugarServings":0,"cricketMinutes":0,"cyclingMinutes":0,"runningMinutes":50,"walkingMinutes":0,"exerciseMinutes":0,"footballMinutes":0,"swimmingMinutes":0,"badmintonMinutes":0,"fastFoodServings":0,"cyclingDistanceKm":0,"meditationMinutes":0,"runningDistanceKm":7,"trackingStartedAt":None,"walkingDistanceKm":0},
]

store = {
    "entries": entries,
    "plans": [plan],
    "form": {"date": "2026-05-20"},
    "updatedAt": NOW,
}

payload_json = json.dumps(store)
sql = f"""
INSERT INTO wellness_user_state (user_id, payload, updated_at)
VALUES ('usr-hardi', '{payload_json.replace("'", "''")}', NOW())
ON CONFLICT (user_id) DO UPDATE
  SET payload = EXCLUDED.payload,
      updated_at = NOW();
SELECT user_id, jsonb_array_length(payload->'entries') AS entry_count,
       jsonb_array_length(payload->'plans') AS plan_count
FROM wellness_user_state WHERE user_id = 'usr-hardi';
"""

result = subprocess.run(
    ['docker', 'exec', '-i', 'infra-postgres-1',
     'psql', '-U', 'cosmix', '-d', 'cosmix'],
    input=sql,
    capture_output=True,
    text=True
)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
