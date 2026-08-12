/**
 * Shared helpers for option strategy legs: same-contract merge + VWAP average.
 */

export function normalizePremium(value) {
  return Number((Number(value) || 0).toFixed(2));
}

export function normalizeLotQty(value) {
  return Math.max(1, parseInt(value || 1, 10) || 1);
}

/** Contract identity for averaging: side + CE/PE + strike + expiry. */
export function legContractKey(leg = {}, fallbackExpiry = null) {
  const side = String(leg.side || 'BUY').toUpperCase();
  const optionType = String(leg.optionType || 'CE').toUpperCase();
  const strike = Number(leg.strike) || 0;
  const expiry = Number(leg.expiry) || Number(fallbackExpiry) || 0;
  return `${side}|${optionType}|${strike}|${expiry}`;
}

export function averagePremium(oldQty, oldPremium, addQty, addPremium) {
  const a = Math.max(0, Number(oldQty) || 0);
  const b = Math.max(0, Number(addQty) || 0);
  if (a + b <= 0) return normalizePremium(addPremium);
  return normalizePremium(((Number(oldPremium) || 0) * a + (Number(addPremium) || 0) * b) / (a + b));
}

/**
 * Merge legs that share the same contract into one averaged line.
 * Keeps the first matching leg's id / locked flags.
 */
export function mergeLegsByContract(legs = [], fallbackExpiry = null) {
  const byKey = new Map();
  (Array.isArray(legs) ? legs : []).forEach((leg) => {
    if (!leg) return;
    const key = legContractKey(leg, fallbackExpiry);
    const qty = normalizeLotQty(leg.quantity);
    const premium = normalizePremium(leg.premium);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...leg,
        quantity: qty,
        premium,
        marketPremium: leg.marketPremium != null && leg.marketPremium !== ''
          ? normalizePremium(leg.marketPremium)
          : premium,
      });
      return;
    }
    const nextQty = existing.quantity + qty;
    const nextPremium = averagePremium(existing.quantity, existing.premium, qty, premium);
    byKey.set(key, {
      ...existing,
      quantity: nextQty,
      premium: nextPremium,
      marketPremium: existing.marketPremium != null && existing.marketPremium !== ''
        ? existing.marketPremium
        : (leg.marketPremium != null && leg.marketPremium !== ''
          ? normalizePremium(leg.marketPremium)
          : nextPremium),
      locked: Boolean(existing.locked || leg.locked),
    });
  });
  return [...byKey.values()];
}

/**
 * Apply an added/edited leg onto an open book.
 * - If editing by id: replace that row, then merge duplicates.
 * - If adding: merge into matching contract (average premium + sum lots).
 */
export function upsertLegIntoBook(legs = [], nextLeg, { editId = null, fallbackExpiry = null } = {}) {
  const incoming = {
    ...nextLeg,
    quantity: normalizeLotQty(nextLeg.quantity),
    premium: normalizePremium(nextLeg.premium),
    marketPremium: nextLeg.marketPremium != null && nextLeg.marketPremium !== ''
      ? normalizePremium(nextLeg.marketPremium)
      : normalizePremium(nextLeg.premium),
  };

  let working;
  if (editId != null) {
    working = (legs || []).map((leg) => (Number(leg.id) === Number(editId) ? { ...incoming, id: leg.id } : leg));
  } else {
    const key = legContractKey(incoming, fallbackExpiry);
    const match = (legs || []).find((leg) => legContractKey(leg, fallbackExpiry) === key);
    if (match) {
      const oldQty = normalizeLotQty(match.quantity);
      const addQty = incoming.quantity;
      working = (legs || []).map((leg) => {
        if (Number(leg.id) !== Number(match.id)) return leg;
        return {
          ...leg,
          side: incoming.side,
          optionType: incoming.optionType,
          expiry: incoming.expiry,
          strike: incoming.strike,
          id: match.id,
          quantity: oldQty + addQty,
          premium: averagePremium(oldQty, match.premium, addQty, incoming.premium),
          marketPremium: match.marketPremium != null && match.marketPremium !== ''
            ? match.marketPremium
            : incoming.marketPremium,
          locked: Boolean(match.locked || incoming.locked),
        };
      });
    } else {
      working = [...(legs || []), incoming];
    }
  }

  return {
    legs: mergeLegsByContract(working, fallbackExpiry),
    merged: editId == null && (legs || []).some((leg) => legContractKey(leg, fallbackExpiry) === legContractKey(incoming, fallbackExpiry)),
  };
}
