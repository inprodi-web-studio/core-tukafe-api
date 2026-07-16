import dayjs, { type Dayjs } from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import type { DashboardGranularity, DashboardPeriod } from "./dashboard.types";

dayjs.extend(utc);
dayjs.extend(timezone);

export const DASHBOARD_TIMEZONE = "America/Mexico_City" as const;

export interface DashboardPeriodRange {
  granularity: DashboardGranularity;
  start: Dayjs;
  end: Dayjs;
  effectiveEnd: Dayjs;
  comparisonStart: Dayjs;
  comparisonEnd: Dayjs;
}

function startOfPeriod(anchor: Dayjs, period: DashboardPeriod): Dayjs {
  if (period === "week") {
    const daysSinceMonday = (anchor.day() + 6) % 7;
    return anchor.startOf("day").subtract(daysSinceMonday, "day");
  }

  return anchor.startOf(period);
}

function addPeriod(value: Dayjs, period: DashboardPeriod, amount: number): Dayjs {
  return value.add(amount, period);
}

export function buildDashboardPeriodRange({
  period,
  anchorDate,
  now = new Date(),
}: {
  period: DashboardPeriod;
  anchorDate: string;
  now?: Date;
}): DashboardPeriodRange {
  const anchor = dayjs.tz(`${anchorDate}T12:00:00`, DASHBOARD_TIMEZONE);
  const current = dayjs(now).tz(DASHBOARD_TIMEZONE);
  const start = startOfPeriod(anchor, period);
  const end = addPeriod(start, period, 1);

  if (start.isAfter(current)) {
    throw new RangeError("Future dashboard periods are not allowed");
  }

  const effectiveEnd = current.isBefore(end) ? current : end;
  const comparisonStart = addPeriod(start, period, -1);
  const comparisonPeriodEnd = start;
  const elapsedMilliseconds = effectiveEnd.diff(start, "millisecond");
  const elapsedComparisonEnd = comparisonStart.add(elapsedMilliseconds, "millisecond");
  const comparisonEnd = effectiveEnd.isBefore(end) && elapsedComparisonEnd.isBefore(comparisonPeriodEnd)
    ? elapsedComparisonEnd
    : comparisonPeriodEnd;

  return {
    granularity: period === "year" ? "month" : "day",
    start,
    end,
    effectiveEnd,
    comparisonStart,
    comparisonEnd,
  };
}

export function listDashboardBuckets(range: DashboardPeriodRange): string[] {
  const unit = range.granularity === "month" ? "month" : "day";
  const format = range.granularity === "month" ? "YYYY-MM-01" : "YYYY-MM-DD";
  const buckets: string[] = [];

  for (let cursor = range.start; cursor.isBefore(range.effectiveEnd); cursor = cursor.add(1, unit)) {
    buckets.push(cursor.format(format));
  }

  return buckets;
}
