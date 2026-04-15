const fs = require('fs');
const path = require('path');
const Datastore = require('@seald-io/nedb');

const dataDir = path.join(process.cwd(), 'data');
const jsonFile = path.join(dataDir, 'saved-options-strategies.json');
const dbFile = path.join(dataDir, 'saved-options-strategies.db');

function loadLegacyStrategies() {
  if (!fs.existsSync(jsonFile)) {
    throw new Error(`Legacy strategy file not found: ${jsonFile}`);
  }

  const raw = fs.readFileSync(jsonFile, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  if (!Array.isArray(parsed)) {
    throw new Error('Legacy strategy file must contain a JSON array.');
  }

  return parsed;
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Datastore({
    filename: dbFile,
    autoload: true,
    timestampData: false,
  });

  if (db.autoloadPromise) {
    await db.autoloadPromise;
  }

  await db.ensureIndexAsync({ fieldName: 'id', unique: true });

  const strategies = loadLegacyStrategies();
  let inserted = 0;
  let updated = 0;

  for (const strategy of strategies) {
    if (!strategy || !strategy.id) {
      continue;
    }

    const existing = await db.findOneAsync({ id: String(strategy.id) }).execAsync();
    await db.updateAsync(
      { id: String(strategy.id) },
      strategy,
      { upsert: true },
    );

    if (existing) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  const total = await db.countAsync({}).execAsync();
  console.log(JSON.stringify({ inserted, updated, total, dbFile, jsonFile }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});