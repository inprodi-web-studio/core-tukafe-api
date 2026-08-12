import { badRequest } from "@core/utils";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const ORDERS_TIMEZONE = "America/Mexico_City" as const;

export function currentOrderLocalDate(now = new Date()): string {
  return dayjs(now).tz(ORDERS_TIMEZONE).format("YYYY-MM-DD");
}

export function resolveOrderDateRange({
  dateFrom,
  dateTo,
  now = new Date(),
}: {
  dateFrom?: string;
  dateTo?: string;
  now?: Date;
}) {
  const fallbackDate = currentOrderLocalDate(now);
  const resolvedDateFrom = dateFrom ?? fallbackDate;
  const resolvedDateTo = dateTo ?? fallbackDate;
  const start = dayjs.tz(`${resolvedDateFrom}T00:00:00`, ORDERS_TIMEZONE);
  const inclusiveEnd = dayjs.tz(`${resolvedDateTo}T00:00:00`, ORDERS_TIMEZONE);

  if (!start.isValid() || !inclusiveEnd.isValid() || start.isAfter(inclusiveEnd)) {
    throw badRequest("order.dateRangeInvalid", "The order date range is invalid");
  }

  return {
    dateFrom: resolvedDateFrom,
    dateTo: resolvedDateTo,
    startAt: start.toDate(),
    endAt: inclusiveEnd.add(1, "day").toDate(),
  };
}
