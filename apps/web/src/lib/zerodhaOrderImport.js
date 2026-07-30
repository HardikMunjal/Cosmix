const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

const LOT_SIZE_BY_SYMBOL = {
  NIFTY: 65,
  BANKNIFTY: 15,
  SENSEX: 20,
  FINNIFTY: 25,
};

const SYMBOLS = 'NIFTY|BANKNIFTY|SENSEX|FINNIFTY';
const MONTH_TOKEN = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';

export function defaultLotSizeForSymbol(symbol = 'NIFTY') {
  return LOT_SIZE_BY_SYMBOL[String(symbol || 'NIFTY').toUpperCase()] || 65;
}

export function buildDefaultStrategyName(prefix = 'Nifty strategy') {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${now.getDate()} ${months[now.getMonth()]} · ${prefix}`;
}

/** Detect when user uploaded Cosmix UI / wrong screen instead of Zerodha. */
export function looksLikeWrongImportSource(text = '') {
  const upper = String(text || '').toUpperCase();
  if (!upper.trim()) return false;
  const cosmixUi = /ENTRY PREMIUM|ADVANCED BUILDER|CONFIGURE LEGS|MIXED EXPIRY|CREATE STRATEGY|ADD\s*LEG|\bCONTINIE\b|\bCONTINUE\b.*\bBACK\b|NET DEBIT|NET CREDIT/.test(upper);
  const hasZerodhaOrders = /\bNIFTY\b/.test(upper) && /\b(COMPLETE|CANCELLED|REJECTED)\b/.test(upper) && /\b(BUY|SELL)\b/.test(upper);
  const hasZerodhaPositions = /\bNIFTY\b/.test(upper) && (/\bLTP\b/.test(upper) || /\bP\s*&\s*L\b/.test(upper) || /\bPOSITIONS?\b/.test(upper) || /\bAVG\.?\b/.test(upper));
  return cosmixUi && !hasZerodhaOrders && !hasZerodhaPositions;
}

export function looksLikePositionsTable(text = '') {
  const upper = String(text || '').toUpperCase();
  if (!/\b(NIFTY|BANKNIFTY|SENSEX|FINNIFTY)\b/.test(upper)) return false;
  const hasPositionHints = /\b(LTP|POSITIONS?|P\s*&\s*L|CHG\.?)\b/.test(upper) || (/\bAVG\.?\b/.test(upper) && /\bQTY\.?\b/.test(upper));
  const hasExecutedHints = /\b(COMPLETE|CANCELLED|REJECTED)\b/.test(upper) && /\b(BUY|SELL)\b/.test(upper);
  return hasPositionHints && !hasExecutedHints;
}

/** Ready-to-paste COMPLETE Nifty fills from the latest Executed table screenshot. */
export const SAMPLE_EXECUTED_NIFTY_ORDERS = [
  'BUY  NIFTY SEP 23700 PE       325/325  186.70 COMPLETE',
  'BUY  NIFTY 4th AUG 24100 PE   130/130   58.60 COMPLETE',
  'BUY  NIFTY 4th AUG 24100 PE   130/130   62.85 COMPLETE',
  'BUY  NIFTY 4th AUG 24100 PE   130/130   68.50 COMPLETE',
  'SELL NIFTY 4th AUG 24200 CE    65/65   145.30 COMPLETE',
  'BUY  NIFTY 4th AUG 24800 CE    65/65     4.35 COMPLETE',
].join('\n');

/** Open Positions snapshot matching the latest Kite Positions screenshot (Nifty only). */
export const SAMPLE_POSITIONS_NIFTY = [
  'NIFTY 4th AUG 24100 PE  910  114.12',
  'NIFTY 4th AUG 24200 CE -195  139.90',
  'NIFTY 4th AUG 24800 CE  195    5.22',
].join('\n');


function normalizeOcrText(raw = '') {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[|•·]/g, ' ')
    .replace(/[‘’‛']/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\bCЕ\b/gi, 'CE')
    .replace(/\bPЕ\b/gi, 'PE')
    .replace(/\bP E\b/gi, 'PE')
    .replace(/\bC E\b/gi, 'CE')
    .replace(/\bN F O\b/gi, 'NFO')
    .replace(/\bB F O\b/gi, 'BFO')
    // OCR often doubles letters: COMPPLETE / comPpLETE
    .replace(/\bCOM+P+L+[EЕ]*T+[EЕ]*\b/gi, 'COMPLETE')
    .replace(/\bCANCEL+E?D\b/gi, 'CANCELLED')
    .replace(/\bREJEC+T(?:ED|D)?\b/gi, 'REJECTED')
    .replace(/\bBU[YV]\b/gi, 'BUY')
    // Red "SELL" in Zerodha screenshots is often mangled by OCR.
    .replace(/\bS\s*E\s*L\s*L\b/gi, 'SELL')
    .replace(/\b(?:5ELL|SELI|SEL1|SEIL|SFLI|SFLL|SFL1|SEL!|SELL\.|5ELI)\b/gi, 'SELL')
    .replace(/\bSEL{1,3}\b/gi, 'SELL')
    // Weekly badge OCR: "4th" → "4%" / "4¥" / "4 ="
    .replace(/\b(\d{1,2})\s*[%#*¥¢]\s*/gi, '$1TH ')
    .replace(/\b(\d{1,2})\s*=+\s*/gi, '$1TH ')
    .replace(/\b(\d{1,2})\s*(?:ST|ND|RD|TH|IH|LH|T H|TH\.|™)\b/gi, '$1TH')
    .replace(/\b(\d{1,2})TH([A-Z]{3})\b/gi, '$1TH $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function coercePremiumToken(token = '') {
  const raw = String(token || '').trim();
  if (!raw) return null;
  if (raw.includes('.')) {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Zerodha always shows 2 decimals; OCR often drops the dot (435 → 4.35, 18670 → 186.70).
  if (digits.length >= 3) {
    const value = Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseInstrumentChunk(chunk = '') {
  const text = normalizeOcrText(chunk).toUpperCase();

  const weekly = text.match(new RegExp(
    `\\b(${SYMBOLS})\\s+(\\d{1,2})\\s*(?:TH)?\\s*(?:[^A-Z0-9]{0,6})?(${MONTH_TOKEN})\\s+(\\d{4,6})\\s+(CE|PE)\\b`,
  ));
  if (weekly) {
    return {
      symbol: weekly[1],
      day: Number(weekly[2]),
      month: weekly[3],
      strike: Number(weekly[4]),
      optionType: weekly[5],
    };
  }

  const monthly = text.match(new RegExp(
    `\\b(${SYMBOLS})\\s+(${MONTH_TOKEN})\\s+(\\d{4,6})\\s+(CE|PE)\\b`,
  ));
  if (monthly) {
    return {
      symbol: monthly[1],
      day: null,
      month: monthly[2],
      strike: Number(monthly[3]),
      optionType: monthly[4],
    };
  }

  const loose = text.match(new RegExp(
    `\\b(${SYMBOLS})\\b([\\s\\S]{0,40}?)\\b(\\d{4,6})\\s+(CE|PE)\\b`,
  ));
  if (loose) {
    const mid = String(loose[2] || '').toUpperCase();
    const monthMatch = mid.match(new RegExp(`\\b(${MONTH_TOKEN})\\b`));
    const dayMatch = mid.match(/\b(\d{1,2})(?:TH)?\b/);
    if (monthMatch) {
      return {
        symbol: loose[1],
        day: dayMatch ? Number(dayMatch[1]) : null,
        month: monthMatch[1],
        strike: Number(loose[3]),
        optionType: loose[4],
      };
    }
  }

  return null;
}

function extractQty(text = '') {
  const upper = normalizeOcrText(text).toUpperCase();
  const slash = upper.match(/\b(\d{1,5})\s*\/\s*(\d{1,5})\b/);
  if (slash) {
    const filled = Number(slash[1]);
    return filled > 0 ? filled : null;
  }
  const twin = upper.match(/\b(\d{2,4})\s+(\d{2,4})\b/);
  if (twin && twin[1] === twin[2] && Number(twin[1]) >= 10) return Number(twin[1]);
  return null;
}

function extractAvgPrice(text = '', strike = null) {
  const upper = normalizeOcrText(text).toUpperCase();
  // Prefer Avg. price immediately after filled qty (with or without decimal point).
  const afterSlash = upper.match(/\b\d{1,5}\s*\/\s*\d{1,5}\s+(\d{1,5}(?:\.\d{1,2})?)\b/);
  if (afterSlash) {
    const value = coercePremiumToken(afterSlash[1]);
    if (value > 0 && value !== Number(strike)) return value;
  }
  const afterTwin = upper.match(/\b(\d{2,4})\s+\1\s+(\d{1,5}(?:\.\d{1,2})?)\b/);
  if (afterTwin) {
    const value = coercePremiumToken(afterTwin[2]);
    if (value > 0 && value !== Number(strike)) return value;
  }
  const prices = [...upper.matchAll(/\b(\d{1,5}(?:\.\d{1,2})?)\b/g)]
    .map((item) => coercePremiumToken(item[1]))
    .filter((value) => value != null && value > 0 && value < 5000)
    .filter((value) => value !== Number(strike));
  if (!prices.length) return null;
  return prices[0];
}

function extractSideNear(text, index) {
  const before = text.slice(Math.max(0, index - 40), index + 8).toUpperCase();
  const buyAt = before.lastIndexOf('BUY');
  const sellAt = before.lastIndexOf('SELL');
  if (buyAt < 0 && sellAt < 0) return null;
  return sellAt > buyAt ? 'SELL' : 'BUY';
}

function statusNear(text, index, span = 150) {
  const slice = normalizeOcrText(text.slice(index, index + span)).toUpperCase();
  if (/\bCOMPLETE\b/.test(slice)) return 'COMPLETE';
  if (/\bCANCELLED\b/.test(slice)) return 'CANCELLED';
  if (/\bREJECTED\b/.test(slice)) return 'REJECTED';
  if (/\b\d+\s*\/\s*\d+\b/.test(slice) && /\d+(?:\.\d{1,2})?/.test(slice)) return 'LIKELY_COMPLETE';
  return null;
}

function clipOrderWindow(fullText, instrumentIndex, instrumentLength) {
  const afterStart = instrumentIndex + instrumentLength;
  const after = fullText.slice(afterStart);
  const nextInstrument = after.search(new RegExp(`\\b(${SYMBOLS})\\b`));
  const nextSide = after.search(/\b(BUY|SELL)\b/);
  let end = Math.min(after.length, 120);
  [nextInstrument, nextSide].forEach((pos) => {
    if (pos >= 0) end = Math.min(end, pos);
  });
  const before = fullText.slice(Math.max(0, instrumentIndex - 36), instrumentIndex);
  const body = fullText.slice(instrumentIndex, afterStart + end);
  return {
    before,
    // Qty / avg price must come from this order only — never from the previous row's tail.
    body,
    full: `${before} ${body}`,
  };
}

function orderKey(order) {
  return [order.side, order.symbol, order.day || '', order.month, order.strike, order.optionType, order.quantity, order.premium].join('|');
}

function pushOrder(bucket, order) {
  if (!order?.side || !order?.symbol || !order?.strike || !order?.optionType) return;
  if (!(order.quantity > 0) || !(order.premium > 0)) return;
  const key = orderKey(order);
  if (bucket.has(key)) return;
  bucket.set(key, order);
}

function parseChunkToOrder(chunk) {
  const upper = normalizeOcrText(chunk).toUpperCase();

  // Keep only the first order in a multi-row chunk so neighboring Avg. prices don't bleed.
  const sideMatch = /\b(BUY|SELL)\b/i.exec(upper);
  if (!sideMatch) return null;
  const sideIndex = sideMatch.index;
  const sideLen = sideMatch[1].length; // BUY=3, SELL=4 (was wrongly hard-coded to 3)
  const rest = upper.slice(sideIndex);
  const nextSide = rest.slice(sideLen).search(/\b(BUY|SELL)\b/);
  const firstOrderText = nextSide >= 0 ? rest.slice(0, nextSide + sideLen) : rest;

  if (/\bCANCELLED\b/.test(firstOrderText) || /\bREJECTED\b/.test(firstOrderText)) return null;

  const instrument = parseInstrumentChunk(firstOrderText);
  if (!instrument) return null;

  const filledQty = extractQty(firstOrderText);
  if (!filledQty) return null;

  const avgPrice = extractAvgPrice(firstOrderText, instrument.strike);
  if (!(avgPrice > 0)) return null;

  // Require COMPLETE, or clearly filled qty/price when OCR drops status.
  if (!/\bCOMPLETE\b/.test(firstOrderText) && !/\b\d+\s*\/\s*\d+\b/.test(firstOrderText)) return null;

  return {
    side: sideMatch[1].toUpperCase(),
    symbol: instrument.symbol,
    day: instrument.day,
    month: instrument.month,
    strike: instrument.strike,
    optionType: instrument.optionType,
    quantity: filledQty,
    premium: avgPrice,
    raw: chunk,
  };
}

function collectSkippedNonFills(normalizedFull = '', preferSymbol = 'NIFTY') {
  const skipped = [];
  const blockRegex = /\b(BUY|SELL)\b[\s\S]{0,240}?\b(CANCELLED|REJECTED)\b/gi;
  let match;
  while ((match = blockRegex.exec(normalizedFull)) != null) {
    const chunk = match[0];
    const instrument = parseInstrumentChunk(chunk);
    if (!instrument) continue;
    if (instrument.symbol !== String(preferSymbol).toUpperCase()) continue;
    const sideMatch = chunk.match(/\b(BUY|SELL)\b/);
    skipped.push({
      side: sideMatch ? sideMatch[1] : null,
      symbol: instrument.symbol,
      day: instrument.day,
      month: instrument.month,
      strike: instrument.strike,
      optionType: instrument.optionType,
      status: /\bREJECTED\b/.test(chunk) ? 'REJECTED' : 'CANCELLED',
    });
  }
  return skipped;
}

/**
 * Parse Zerodha Kite Positions table (Instrument / Qty / Avg / LTP).
 * Negative qty = short (SELL). Qty 0 = closed — skipped.
 */
export function parseZerodhaPositionsText(rawText = '', options = {}) {
  const { preferSymbol = 'NIFTY' } = options;
  const text = String(rawText || '');
  if (!text.trim()) return { orders: [], legs: [], warnings: ['No positions text found.'] };

  const normalizedFull = normalizeOcrText(text).toUpperCase()
    .replace(/P\s*&\s*L/g, 'PNL')
    .replace(/,/g, '');

  const found = new Map();
  const instrumentRegex = new RegExp(
    `\\b(${SYMBOLS})\\s+(?:(\\d{1,2})\\s*(?:TH)?\\s*(?:[^A-Z0-9]{0,6})?)?(${MONTH_TOKEN})\\s+(\\d{4,6})\\s+(CE|PE)\\b`,
    'gi',
  );

  let match;
  while ((match = instrumentRegex.exec(normalizedFull)) != null) {
    const symbol = match[1].toUpperCase();
    const day = match[2] ? Number(match[2]) : null;
    const month = match[3].toUpperCase();
    const strike = Number(match[4]);
    const optionType = match[5].toUpperCase();

    const after = normalizedFull.slice(match.index + match[0].length, match.index + match[0].length + 100)
      .replace(/\b(NFO|BFO|CDS|MCX|NRML|MIS|CNC)\b/g, ' ')
      .trim();

    // Executed rows look like 130/130 — never treat those as Positions.
    if (/\b\d{1,5}\s*\/\s*\d{1,5}\b/.test(after)) continue;
    if (/\b(BUY|SELL|COMPLETE|CANCELLED|REJECTED)\b/.test(after.slice(0, 40))) continue;

    // Qty (signed int), Avg, LTP — ignore P&L / % later.
    const tokens = [...after.matchAll(/(-?\d+(?:\.\d{1,2})?)/g)].map((item) => item[1]);
    if (!tokens.length) continue;

    const qtyToken = tokens[0];
    // Position qty is a whole number (lots × lot size), not a premium with decimals.
    if (qtyToken.includes('.')) continue;
    const qty = Number(qtyToken);
    if (!Number.isFinite(qty) || qty === 0) continue; // closed position

    let premium = null;
    for (let i = 1; i < tokens.length; i += 1) {
      const raw = tokens[i];
      // Prefer real Avg. decimals from Kite (114.12, 5.22). Avoid treating next qty-like ints as premium.
      if (!raw.includes('.') && Math.abs(Number(raw)) >= 10) continue;
      const value = coercePremiumToken(raw);
      if (value == null) continue;
      if (value === strike) continue;
      // Avg is typically under a few thousand; skip huge P&L numbers.
      if (value >= 5000) continue;
      premium = value;
      break;
    }
    // Fallback: first non-strike decimal-looking value even if OCR dropped the dot (e.g. 522 → 5.22 only when forced).
    if (!(premium > 0)) {
      for (let i = 1; i < Math.min(tokens.length, 4); i += 1) {
        const value = coercePremiumToken(tokens[i]);
        if (value == null || value === strike || value >= 5000) continue;
        if (value >= 10 && !String(tokens[i]).includes('.')) continue;
        premium = value;
        break;
      }
    }
    if (!(premium > 0)) continue;

    const side = qty < 0 ? 'SELL' : 'BUY';
    const quantity = Math.abs(Math.round(qty));
    pushOrder(found, {
      side,
      symbol,
      day,
      month,
      strike,
      optionType,
      quantity,
      premium,
      raw: match[0],
      source: 'positions',
    });
  }

  const warnings = [];
  const filteredSeed = [...found.values()].filter((order) => order.symbol === String(preferSymbol).toUpperCase());
  const seed = filteredSeed.length ? filteredSeed : [...found.values()];
  if (!filteredSeed.length && found.size) {
    warnings.push(`Found ${found.size} open position(s), but none for ${preferSymbol}. Showing all symbols.`);
  }

  const lotSize = defaultLotSizeForSymbol(seed[0]?.symbol || preferSymbol);
  const legs = seed.map((order) => ({
    side: order.side,
    optionType: order.optionType,
    strike: order.strike,
    quantity: Math.max(1, Math.round(order.quantity / lotSize) || 1),
    premium: Number(Number(order.premium).toFixed(2)),
    symbol: order.symbol,
    expiryHint: {
      day: order.day,
      month: order.month,
    },
  }));

  if (!legs.length) {
    warnings.push('Could not detect open option positions. Try Positions (Qty / Avg) or Executed (COMPLETE fills).');
  }

  return {
    orders: seed,
    legs,
    lotSize,
    warnings,
    source: 'positions',
    rawPreview: normalizedFull.slice(0, 500),
  };
}

function parseExecutedOrdersText(rawText = '', options = {}) {
  const { preferSymbol = 'NIFTY' } = options;
  const text = String(rawText || '');
  if (!text.trim()) return { orders: [], legs: [], warnings: ['No order text found.'] };

  const normalizedFull = normalizeOcrText(text).toUpperCase();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const found = new Map();

  lines.forEach((line) => {
    const order = parseChunkToOrder(line);
    if (order) pushOrder(found, order);
  });

  const blockRegex = /\b(BUY|SELL)\b[\s\S]{0,240}?\b(COMPLETE|CANCELLED|REJECTED|OPEN)\b/gi;
  let match;
  while ((match = blockRegex.exec(normalizedFull)) != null) {
    const order = parseChunkToOrder(match[0]);
    if (order) pushOrder(found, order);
  }

  // Side-anchored pass: each BUY/SELL owns the following instrument window.
  const sideRegex = /\b(BUY|SELL)\b/gi;
  while ((match = sideRegex.exec(normalizedFull)) != null) {
    const start = match.index;
    const afterSide = normalizedFull.slice(start + match[0].length);
    const nextSideRel = afterSide.search(/\b(BUY|SELL)\b/);
    const chunk = normalizedFull.slice(start, nextSideRel >= 0 ? start + match[0].length + nextSideRel : start + 220);
    const order = parseChunkToOrder(chunk);
    if (order) pushOrder(found, order);
  }

  const instrumentRegex = new RegExp(
    `\\b(${SYMBOLS})\\s+(?:(\\d{1,2})\\s*(?:TH)?\\s*(?:[^A-Z0-9]{0,6})?)?(${MONTH_TOKEN})\\s+(\\d{4,6})\\s+(CE|PE)\\b`,
    'gi',
  );
  while ((match = instrumentRegex.exec(normalizedFull)) != null) {
    const index = match.index;
    const status = statusNear(normalizedFull, index, 130);
    if (status === 'CANCELLED' || status === 'REJECTED') continue;

    const side = extractSideNear(normalizedFull, index);
    if (!side) continue;

    const window = clipOrderWindow(normalizedFull, index, match[0].length);
    if (/\bCANCELLED\b/.test(window.body) || /\bREJECTED\b/.test(window.body)) continue;

    const qty = extractQty(window.body);
    const premium = extractAvgPrice(window.body, Number(match[4]));
    if (!qty || !(premium > 0)) continue;
    if (status !== 'COMPLETE' && status !== 'LIKELY_COMPLETE') continue;

    pushOrder(found, {
      side,
      symbol: match[1].toUpperCase(),
      day: match[2] ? Number(match[2]) : null,
      month: match[3].toUpperCase(),
      strike: Number(match[4]),
      optionType: match[5].toUpperCase(),
      quantity: qty,
      premium,
      raw: match[0],
      source: 'executed',
    });
  }

  // Recover OCR-split rows only when a single line did not already parse.
  for (let i = 0; i < lines.length; i += 1) {
    if (parseChunkToOrder(lines[i])) continue;
    const joined = [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean).join(' ');
    const order = parseChunkToOrder(joined);
    if (order) pushOrder(found, order);
  }

  const warnings = [];
  const skipped = collectSkippedNonFills(normalizedFull, preferSymbol);
  const filteredSeed = [...found.values()].filter((order) => order.symbol === String(preferSymbol).toUpperCase());
  const seed = filteredSeed.length ? filteredSeed : [...found.values()];
  if (!filteredSeed.length && found.size) {
    warnings.push(`Found ${found.size} filled order(s), but none for ${preferSymbol}. Showing all symbols.`);
  }

  const skippedSells = skipped.filter((item) => item.side === 'SELL');
  if (skippedSells.length) {
    const sample = skippedSells.slice(0, 3).map((item) => {
      const exp = item.day ? `${item.day} ${item.month}` : item.month;
      return `${exp} ${item.strike} ${item.optionType} (${item.status})`;
    }).join(', ');
    warnings.push(
      `Skipped ${skippedSells.length} non-filled SELL order(s) — not imported: ${sample}. Only COMPLETE fills become legs.`,
    );
  }

  const lotSize = defaultLotSizeForSymbol(seed[0]?.symbol || preferSymbol);
  const merged = new Map();
  seed.forEach((order) => {
    const key = [order.side, order.symbol, order.day || '', order.month, order.strike, order.optionType].join('|');
    if (!merged.has(key)) {
      merged.set(key, {
        ...order,
        totalQty: order.quantity,
        premiumSum: order.premium * order.quantity,
        fills: [{ quantity: order.quantity, premium: order.premium }],
      });
      return;
    }
    const current = merged.get(key);
    const duplicate = current.fills.some(
      (fill) => fill.quantity === order.quantity && Math.abs(fill.premium - order.premium) < 0.05,
    );
    if (duplicate) return;

    current.fills.push({ quantity: order.quantity, premium: order.premium });
    current.totalQty += order.quantity;
    current.premiumSum += order.premium * order.quantity;
    current.premium = Number((current.premiumSum / current.totalQty).toFixed(2));
  });

  const legs = [...merged.values()].map((order) => ({
    side: order.side,
    optionType: order.optionType,
    strike: order.strike,
    quantity: Math.max(1, Math.round(order.totalQty / lotSize) || 1),
    premium: Number(order.premium.toFixed(2)),
    symbol: order.symbol,
    expiryHint: {
      day: order.day,
      month: order.month,
    },
  }));

  if (!legs.length) {
    warnings.push('Could not detect filled Nifty option orders. Try a clearer crop of the Executed table, or paste the rows as text.');
  } else if (legs.length === 1) {
    warnings.push('Only one Nifty leg was detected from the screenshot. If more rows exist, paste the Executed table text for a fuller import.');
  }

  return {
    orders: seed,
    legs,
    lotSize,
    warnings,
    source: 'executed',
    rawPreview: normalizedFull.slice(0, 500),
  };
}

/**
 * Parse Zerodha Kite Executed orders and/or Positions text / OCR into legs.
 * Positions (open book) wins when both parse, since qty/avg match the live strategy.
 */
export function parseZerodhaOrdersText(rawText = '', options = {}) {
  const text = String(rawText || '');
  if (!text.trim()) return { orders: [], legs: [], warnings: ['No order text found.'] };

  const positions = parseZerodhaPositionsText(text, options);
  const executed = parseExecutedOrdersText(text, options);

  // Prefer Positions only when the OCR/text looks like the Positions book.
  if (looksLikePositionsTable(text) && positions.legs.length) {
    return positions;
  }

  if (executed.legs.length) {
    return executed;
  }

  if (positions.legs.length) {
    return {
      ...positions,
      warnings: [
        ...positions.warnings,
        'Parsed as open Positions (Qty/Avg).',
      ],
    };
  }

  return {
    orders: [],
    legs: [],
    lotSize: defaultLotSizeForSymbol(options.preferSymbol || 'NIFTY'),
    warnings: [
      'Could not detect Nifty positions or COMPLETE fills. Upload Positions (Qty/Avg) or Executed (BUY/SELL COMPLETE), or paste the table text.',
    ],
    source: 'none',
    rawPreview: normalizeOcrText(text).toUpperCase().slice(0, 500),
  };
}

export function matchExpiryFromHint(hint, expiryOptions = [], now = new Date()) {
  if (!hint?.month || !expiryOptions.length) return null;
  const monthIndex = MONTHS[String(hint.month).toUpperCase()];
  if (monthIndex == null) return null;

  const year = now.getFullYear();
  const candidates = expiryOptions
    .map((unix) => {
      const date = new Date((Number(unix) * 1000) + (5.5 * 60 * 60 * 1000));
      return {
        unix: Number(unix),
        day: date.getUTCDate(),
        month: date.getUTCMonth(),
        year: date.getUTCFullYear(),
      };
    })
    .filter((item) => item.month === monthIndex)
    .filter((item) => item.year === year || item.year === year + 1 || item.year === year - 1);

  if (!candidates.length) return null;

  if (hint.day != null) {
    const exact = candidates.find((item) => item.day === Number(hint.day));
    if (exact) return exact.unix;
    candidates.sort((a, b) => Math.abs(a.day - Number(hint.day)) - Math.abs(b.day - Number(hint.day)));
    return candidates[0].unix;
  }

  candidates.sort((a, b) => b.day - a.day);
  return candidates[0].unix;
}

async function preprocessImageForOcr(file, mode = 'contrast') {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 2000;
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1.6;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bitmap, 0, 0, width, height);

  if (mode !== 'raw') {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Keep chromatic ink (blue BUY / red SELL) darker so OCR retains Type column.
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      let gray = (r * 0.299) + (g * 0.587) + (b * 0.114);
      if (chroma > 40) gray = Math.min(gray, Math.min(r, g, b) * 0.85);
      const boosted = mode === 'soft'
        ? (gray < 170 ? Math.max(0, gray - 10) : Math.min(255, gray + 20))
        : (gray < 160 ? Math.max(0, gray - 30) : Math.min(255, gray + 40));
      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }
    ctx.putImageData(image, 0, 0);
  }
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob || file;
}

export async function extractTextFromImage(file) {
  if (!file || typeof window === 'undefined') {
    throw new Error('Image upload is only available in the browser.');
  }

  const loadTesseract = () => new Promise((resolve, reject) => {
    if (window.Tesseract?.recognize) {
      resolve(window.Tesseract);
      return;
    }
    const existing = document.querySelector('script[data-tesseract]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Tesseract));
      existing.addEventListener('error', () => reject(new Error('Failed to load OCR engine.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.dataset.tesseract = '1';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Failed to load OCR engine.'));
    document.head.appendChild(script);
  });

  const Tesseract = await loadTesseract();
  const modes = ['soft', 'contrast', 'raw'];
  let bestText = '';
  let bestScore = -1;

  for (const mode of modes) {
    try {
      const prepared = await preprocessImageForOcr(file, mode);
      const result = await Tesseract.recognize(prepared, 'eng', {
        logger: () => {},
      });
      const text = String(result?.data?.text || '');
      const parsed = parseZerodhaOrdersText(text, { preferSymbol: 'NIFTY' });
      const score = (parsed.legs?.length || 0) * 10
        + (parsed.orders?.length || 0)
        + (/SELL/i.test(text) ? 2 : 0)
        + (/SEP/i.test(text) ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
      // Good enough: SEP + weekly sells/buys typically ≥ 3 legs
      if ((parsed.legs?.length || 0) >= 3) break;
    } catch (_) {
      // try next mode
    }
  }

  return bestText;
}
