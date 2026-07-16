import { memberDB, organizationDB } from "@core/db/schemas";
import { badRequest, forbidden } from "@core/utils";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  buildDashboardPeriodRange,
  DASHBOARD_TIMEZONE,
  listDashboardBuckets,
} from "./dashboard.period";
import type {
  AdminDashboardService,
  DashboardMetric,
  DashboardParams,
  DashboardResponse,
  DashboardTimelineItem,
  DashboardTopProduct,
} from "./dashboard.types";

interface AggregateRow extends Record<string, unknown> {
  bucket?: string | Date;
  orders?: string | number;
  generatedSalesCents?: string | number;
  netCollectedCents?: string | number;
  tipsCents?: string | number;
  freeDrinkRedemptions?: string | number;
  freeDrinkUnits?: string | number;
  cashbackRedemptions?: string | number;
  cashbackRedeemedCents?: string | number;
}

interface TopProductRow extends Record<string, unknown> {
  productId: string;
  name: string;
  deliveredUnits: string | number;
  paidUnits: string | number;
  freeUnits: string | number;
  generatedSalesCents: string | number;
}

function toNumber(value: string | number | null | undefined): number {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toInteger(value: string | number | null | undefined): number {
  return Math.max(0, Math.round(toNumber(value)));
}

function buildMetric(value: number, previousValue: number): DashboardMetric {
  return {
    value,
    previousValue,
    changePercent:
      previousValue === 0
        ? null
        : Math.round((((value - previousValue) / previousValue) * 100 + Number.EPSILON) * 100) /
          100,
  };
}

function emptyTimelineItem(bucket: string): DashboardTimelineItem {
  return {
    bucket,
    orders: 0,
    generatedSalesCents: 0,
    netCollectedCents: 0,
    tipsCents: 0,
    freeDrinkRedemptions: 0,
    freeDrinkUnits: 0,
    cashbackRedemptions: 0,
    cashbackRedeemedCents: 0,
  };
}

function normalizeAggregate(row: AggregateRow, bucket: string): DashboardTimelineItem {
  return {
    bucket,
    orders: toInteger(row.orders),
    generatedSalesCents: toInteger(row.generatedSalesCents),
    netCollectedCents: toInteger(row.netCollectedCents),
    tipsCents: toInteger(row.tipsCents),
    freeDrinkRedemptions: toInteger(row.freeDrinkRedemptions),
    freeDrinkUnits: toInteger(row.freeDrinkUnits),
    cashbackRedemptions: toInteger(row.cashbackRedemptions),
    cashbackRedeemedCents: toInteger(row.cashbackRedeemedCents),
  };
}

function aggregateTimeline(timeline: DashboardTimelineItem[]): DashboardTimelineItem {
  return timeline.reduce(
    (total, item) => ({
      bucket: "total",
      orders: total.orders + item.orders,
      generatedSalesCents: total.generatedSalesCents + item.generatedSalesCents,
      netCollectedCents: total.netCollectedCents + item.netCollectedCents,
      tipsCents: total.tipsCents + item.tipsCents,
      freeDrinkRedemptions: total.freeDrinkRedemptions + item.freeDrinkRedemptions,
      freeDrinkUnits: total.freeDrinkUnits + item.freeDrinkUnits,
      cashbackRedemptions: total.cashbackRedemptions + item.cashbackRedemptions,
      cashbackRedeemedCents: total.cashbackRedeemedCents + item.cashbackRedeemedCents,
    }),
    emptyTimelineItem("total"),
  );
}

function localBucketExpression(granularity: "day" | "month") {
  const datePart = granularity === "month" ? "month" : "day";
  return sql.raw(
    `to_char(date_trunc('${datePart}', (o.created_at at time zone 'UTC') at time zone '${DASHBOARD_TIMEZONE}'), 'YYYY-MM-DD')`,
  );
}

async function loadAggregate(
  fastify: FastifyInstance,
  organizationIds: string[],
  start: Date,
  end: Date,
  granularity?: "day" | "month",
): Promise<AggregateRow[]> {
  const organizationList = sql.join(
    organizationIds.map((organizationId) => sql`${organizationId}`),
    sql`, `,
  );
  const bucket = granularity ? localBucketExpression(granularity) : sql`null`;
  const groupBy = granularity ? sql`group by 1 order by 1` : sql``;

  const result = await fastify.db.execute<AggregateRow>(sql`
    with order_free_units as (
      select
        order_id,
        coalesce(sum(free_units), 0)::integer as free_units
      from order_item
      group by order_id
    )
    select
      ${bucket} as bucket,
      count(*)::integer as "orders",
      coalesce(sum(o.subtotal_cents + o.taxes_cents), 0)::bigint as "generatedSalesCents",
      coalesce(sum(greatest(o.subtotal_cents + o.taxes_cents - o.cashback_redemption_cents, 0)), 0)::bigint as "netCollectedCents",
      coalesce(sum(o.tip_cents), 0)::bigint as "tipsCents",
      count(*) filter (where coalesce(f.free_units, 0) > 0)::integer as "freeDrinkRedemptions",
      coalesce(sum(f.free_units), 0)::bigint as "freeDrinkUnits",
      count(*) filter (where o.cashback_redemption_cents > 0)::integer as "cashbackRedemptions",
      coalesce(sum(o.cashback_redemption_cents), 0)::bigint as "cashbackRedeemedCents"
    from "order" o
    left join order_free_units f on f.order_id = o.id
    where o.organization_id in (${organizationList})
      and o.created_at >= ${start}
      and o.created_at < ${end}
    ${groupBy}
  `);

  return result.rows;
}

async function loadTopProducts(
  fastify: FastifyInstance,
  organizationIds: string[],
  start: Date,
  end: Date,
): Promise<DashboardTopProduct[]> {
  const organizationList = sql.join(
    organizationIds.map((organizationId) => sql`${organizationId}`),
    sql`, `,
  );
  const result = await fastify.db.execute<TopProductRow>(sql`
    select
      oi.product_id as "productId",
      (array_agg(oi.product_name order by o.created_at desc, oi.sort_order desc))[1] as "name",
      coalesce(sum(oi.quantity), 0)::double precision as "deliveredUnits",
      coalesce(sum(greatest(oi.quantity - oi.free_units, 0)), 0)::double precision as "paidUnits",
      coalesce(sum(oi.free_units), 0)::double precision as "freeUnits",
      coalesce(sum(oi.grand_total_cents), 0)::bigint as "generatedSalesCents"
    from order_item oi
    inner join "order" o on o.id = oi.order_id
    where o.organization_id in (${organizationList})
      and o.created_at >= ${start}
      and o.created_at < ${end}
    group by oi.product_id
    order by sum(oi.quantity) desc, sum(oi.grand_total_cents) desc, "name" asc
    limit 5
  `);

  return result.rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    deliveredUnits: toNumber(row.deliveredUnits),
    paidUnits: toNumber(row.paidUnits),
    freeUnits: toNumber(row.freeUnits),
    generatedSalesCents: toInteger(row.generatedSalesCents),
  }));
}

function formatBucket(value: string | Date, granularity: "day" | "month"): string {
  const formatted = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  return granularity === "month" ? `${formatted.slice(0, 7)}-01` : formatted;
}

export function adminDashboardService(fastify: FastifyInstance): AdminDashboardService {
  return {
    async get(input: DashboardParams): Promise<DashboardResponse> {
      let range;
      try {
        range = buildDashboardPeriodRange(input);
      } catch (error) {
        if (error instanceof RangeError) {
          throw badRequest("dashboard.futurePeriodNotAllowed", error.message);
        }
        throw error;
      }

      const memberships = await fastify.db
        .select({
          organizationId: memberDB.organizationId,
          organizationName: organizationDB.name,
        })
        .from(memberDB)
        .innerJoin(organizationDB, eq(memberDB.organizationId, organizationDB.id))
        .where(
          and(
            eq(memberDB.userId, input.userId),
            inArray(memberDB.role, ["owner", "admin"]),
            isNull(organizationDB.deletedAt),
          ),
        )
        .orderBy(asc(organizationDB.name));

      const allowedOrganizationIds = memberships.map((membership) => membership.organizationId);
      if (input.organizationId && !allowedOrganizationIds.includes(input.organizationId)) {
        throw forbidden(
          "dashboard.organizationAccessDenied",
          "The requested organization is not available to this administrator",
        );
      }

      const organizationIds = input.organizationId
        ? [input.organizationId]
        : allowedOrganizationIds;

      if (organizationIds.length === 0) {
        throw forbidden(
          "dashboard.noOrganizations",
          "The administrator does not have access to any organizations",
        );
      }

      const [aggregateRows, previousRows, topProducts] = await Promise.all([
        loadAggregate(
          fastify,
          organizationIds,
          range.start.toDate(),
          range.effectiveEnd.toDate(),
          range.granularity,
        ),
        loadAggregate(
          fastify,
          organizationIds,
          range.comparisonStart.toDate(),
          range.comparisonEnd.toDate(),
        ),
        loadTopProducts(
          fastify,
          organizationIds,
          range.start.toDate(),
          range.effectiveEnd.toDate(),
        ),
      ]);

      const aggregatesByBucket = new Map(
        aggregateRows
          .filter((row) => row.bucket)
          .map((row) => [formatBucket(row.bucket!, range.granularity), row]),
      );
      const timeline = listDashboardBuckets(range).map((bucket) => {
        const row = aggregatesByBucket.get(bucket);
        return row ? normalizeAggregate(row, bucket) : emptyTimelineItem(bucket);
      });
      const current = aggregateTimeline(timeline);
      const previous = normalizeAggregate(previousRows[0] ?? {}, "previous");

      return {
        scope: {
          period: input.period,
          granularity: range.granularity,
          timezone: DASHBOARD_TIMEZONE,
          startAt: range.start.toDate().toISOString(),
          endAt: range.effectiveEnd.toDate().toISOString(),
          comparisonStartAt: range.comparisonStart.toDate().toISOString(),
          comparisonEndAt: range.comparisonEnd.toDate().toISOString(),
          organizationId: input.organizationId ?? null,
          organizationCount: organizationIds.length,
        },
        summary: {
          orders: buildMetric(current.orders, previous.orders),
          generatedSalesCents: buildMetric(
            current.generatedSalesCents,
            previous.generatedSalesCents,
          ),
          netCollectedCents: buildMetric(
            current.netCollectedCents,
            previous.netCollectedCents,
          ),
          tipsCents: buildMetric(current.tipsCents, previous.tipsCents),
        },
        timeline,
        topProducts,
      };
    },
  };
}
