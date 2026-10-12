import TaxPeriodLock from "../../models/TaxPeriodLock.js";
import { taxPeriodOf } from "./documentNumber.js";

/** "2026-10" → "2026-11"; "2026-12" → "2027-01". */
export const nextPeriod = (period) => {
  const [y, m] = String(period).split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * The return period a document is reported in: the month of the supply, unless that month's return
 * has been filed (locked) — then the current month, moving forward past any further locked months.
 */
export const reportingPeriodFor = async (supplyDate = new Date(), now = new Date()) => {
  const natural = taxPeriodOf(supplyDate);
  let locked;
  try {
    locked = new Set((await TaxPeriodLock.find({ period: { $gte: natural } }).select("period").lean()).map((l) => l.period));
  } catch {
    return natural;
  }
  if (!locked.has(natural)) return natural;
  let period = taxPeriodOf(now) > natural ? taxPeriodOf(now) : nextPeriod(natural);
  while (locked.has(period)) period = nextPeriod(period);
  return period;
};
