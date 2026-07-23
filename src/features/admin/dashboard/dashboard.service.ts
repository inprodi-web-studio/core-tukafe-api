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
  DashboardModifierGroup,
  DashboardOrderSource,
  DashboardOrderSourceMetric,
  DashboardOrderSources,
  DashboardParams,
  DashboardResponse,
  DashboardTimelineItem,
  DashboardTopProduct,
  DashboardVariationGroup,
} from "./dashboard.types";

interface AggregateRow extends Record<string, unknown> {
  bucket?: string | Date;
  orders?: string | number;
  productUnits?: string | number;
  generatedSalesCents?: string | number;
  netCollectedCents?: string | number;
  tipsCents?: string | number;
  freeDrinkRedemptions?: string | number;
  freeDrinkUnits?: string | number;
  freeDrinkRetailValueCents?: string | number;
  freeDrinkBeverageValueCents?: string | number;
  freeDrinkModifierValueCents?: string | number;
  cashbackRedemptions?: string | number;
  cashbackRedeemedCents?: string | number;
  inplaceOrders?: string | number;
  inplaceGeneratedSalesCents?: string | number;
  inplaceNetCollectedCents?: string | number;
  mobileOrders?: string | number;
  mobileGeneratedSalesCents?: string | number;
  mobileNetCollectedCents?: string | number;
  adminOrders?: string | number;
  adminGeneratedSalesCents?: string | number;
  adminNetCollectedCents?: string | number;
  unknownOrders?: string | number;
  unknownGeneratedSalesCents?: string | number;
  unknownNetCollectedCents?: string | number;
}

interface ModifierRankingRow extends Record<string, unknown> {
  modifierId: string;
  modifierName: string;
  modifierOptionId: string;
  modifierOptionName: string;
  groupSelectionUnits: string | number;
  groupPaidSelectionUnits: string | number;
  groupConfiguredExtraCents: string | number;
  optionSelectionUnits: string | number;
  optionPaidSelectionUnits: string | number;
  optionConfiguredExtraCents: string | number;
}

interface VariationRankingRow extends Record<string, unknown> {
  variationGroupId: string;
  variationGroupName: string;
  variationOptionId: string;
  variationOptionName: string;
  groupSelectionUnits: string | number;
  groupAssociatedSalesCents: string | number;
  optionSelectionUnits: string | number;
  optionAssociatedSalesCents: string | number;
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

export function collectCategoryAndDescendantIds(
  categories: Array<{ id: string; parentId: string | null }>,
  selectedCategoryIds: string[],
): string[] {
  const knownCategoryIds = new Set(categories.map((category) => category.id));
  const missingCategoryId = selectedCategoryIds.find(
    (categoryId) => !knownCategoryIds.has(categoryId),
  );

  if (missingCategoryId) {
    throw badRequest(
      "dashboard.invalidCategory",
      "One or more product categories were not found",
    );
  }

  const includedCategoryIds = new Set(selectedCategoryIds);
  let addedCategory = true;

  while (addedCategory) {
    addedCategory = false;

    for (const category of categories) {
      if (
        category.parentId &&
        includedCategoryIds.has(category.parentId) &&
        !includedCategoryIds.has(category.id)
      ) {
        includedCategoryIds.add(category.id);
        addedCategory = true;
      }
    }
  }

  return [...includedCategoryIds];
}

async function resolveCategoryFilterIds(
  fastify: FastifyInstance,
  selectedCategoryIds?: string[],
): Promise<string[] | undefined> {
  if (!selectedCategoryIds?.length) {
    return undefined;
  }

  const categories = await fastify.db.query.productCategoriesDB.findMany({
    columns: {
      id: true,
      parentId: true,
    },
  });

  return collectCategoryAndDescendantIds(categories, selectedCategoryIds);
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
    productUnits: 0,
    generatedSalesCents: 0,
    netCollectedCents: 0,
    tipsCents: 0,
    freeDrinkRedemptions: 0,
    freeDrinkUnits: 0,
    freeDrinkRetailValueCents: 0,
    freeDrinkBeverageValueCents: 0,
    freeDrinkModifierValueCents: 0,
    cashbackRedemptions: 0,
    cashbackRedeemedCents: 0,
  };
}

function normalizeAggregate(row: AggregateRow, bucket: string): DashboardTimelineItem {
  return {
    bucket,
    orders: toInteger(row.orders),
    productUnits: Math.max(0, toNumber(row.productUnits)),
    generatedSalesCents: toInteger(row.generatedSalesCents),
    netCollectedCents: toInteger(row.netCollectedCents),
    tipsCents: toInteger(row.tipsCents),
    freeDrinkRedemptions: toInteger(row.freeDrinkRedemptions),
    freeDrinkUnits: toInteger(row.freeDrinkUnits),
    freeDrinkRetailValueCents: toInteger(row.freeDrinkRetailValueCents),
    freeDrinkBeverageValueCents: toInteger(row.freeDrinkBeverageValueCents),
    freeDrinkModifierValueCents: toInteger(row.freeDrinkModifierValueCents),
    cashbackRedemptions: toInteger(row.cashbackRedemptions),
    cashbackRedeemedCents: toInteger(row.cashbackRedeemedCents),
  };
}

function aggregateTimeline(timeline: DashboardTimelineItem[]): DashboardTimelineItem {
  return timeline.reduce(
    (total, item) => ({
      bucket: "total",
      orders: total.orders + item.orders,
      productUnits: total.productUnits + item.productUnits,
      generatedSalesCents: total.generatedSalesCents + item.generatedSalesCents,
      netCollectedCents: total.netCollectedCents + item.netCollectedCents,
      tipsCents: total.tipsCents + item.tipsCents,
      freeDrinkRedemptions: total.freeDrinkRedemptions + item.freeDrinkRedemptions,
      freeDrinkUnits: total.freeDrinkUnits + item.freeDrinkUnits,
      freeDrinkRetailValueCents:
        total.freeDrinkRetailValueCents + item.freeDrinkRetailValueCents,
      freeDrinkBeverageValueCents:
        total.freeDrinkBeverageValueCents + item.freeDrinkBeverageValueCents,
      freeDrinkModifierValueCents:
        total.freeDrinkModifierValueCents + item.freeDrinkModifierValueCents,
      cashbackRedemptions: total.cashbackRedemptions + item.cashbackRedemptions,
      cashbackRedeemedCents: total.cashbackRedeemedCents + item.cashbackRedeemedCents,
    }),
    emptyTimelineItem("total"),
  );
}

const ORDER_SOURCES: DashboardOrderSource[] = ["inplace", "mobile", "admin", "unknown"];

function emptyOrderSourceMetric(): DashboardOrderSourceMetric {
  return { orders: 0, generatedSalesCents: 0, netCollectedCents: 0 };
}

function emptyOrderSourceRecord(): Record<DashboardOrderSource, DashboardOrderSourceMetric> {
  return {
    inplace: emptyOrderSourceMetric(),
    mobile: emptyOrderSourceMetric(),
    admin: emptyOrderSourceMetric(),
    unknown: emptyOrderSourceMetric(),
  };
}

function normalizeOrderSources(row?: AggregateRow): Record<DashboardOrderSource, DashboardOrderSourceMetric> {
  if (!row) {
    return emptyOrderSourceRecord();
  }

  return {
    inplace: {
      orders: toInteger(row.inplaceOrders),
      generatedSalesCents: toInteger(row.inplaceGeneratedSalesCents),
      netCollectedCents: toInteger(row.inplaceNetCollectedCents),
    },
    mobile: {
      orders: toInteger(row.mobileOrders),
      generatedSalesCents: toInteger(row.mobileGeneratedSalesCents),
      netCollectedCents: toInteger(row.mobileNetCollectedCents),
    },
    admin: {
      orders: toInteger(row.adminOrders),
      generatedSalesCents: toInteger(row.adminGeneratedSalesCents),
      netCollectedCents: toInteger(row.adminNetCollectedCents),
    },
    unknown: {
      orders: toInteger(row.unknownOrders),
      generatedSalesCents: toInteger(row.unknownGeneratedSalesCents),
      netCollectedCents: toInteger(row.unknownNetCollectedCents),
    },
  };
}

function buildOrderSources(
  buckets: string[],
  aggregatesByBucket: Map<string, AggregateRow>,
): DashboardOrderSources {
  const timeline = buckets.map((bucket) => ({
    bucket,
    sources: normalizeOrderSources(aggregatesByBucket.get(bucket)),
  }));
  const totals = emptyOrderSourceRecord();

  for (const item of timeline) {
    for (const source of ORDER_SOURCES) {
      totals[source].orders += item.sources[source].orders;
      totals[source].generatedSalesCents += item.sources[source].generatedSalesCents;
      totals[source].netCollectedCents += item.sources[source].netCollectedCents;
    }
  }

  return { totals, timeline };
}

function localBucketExpression(granularity: "hour" | "day" | "month") {
  const format = granularity === "hour" ? 'YYYY-MM-DD"T"HH24:00:00' : "YYYY-MM-DD";
  return sql.raw(
    `to_char(date_trunc('${granularity}', (o.created_at at time zone 'UTC') at time zone '${DASHBOARD_TIMEZONE}'), '${format}')`,
  );
}

async function loadAggregate(
  fastify: FastifyInstance,
  organizationIds: string[],
  start: Date,
  end: Date,
  granularity?: "hour" | "day" | "month",
  categoryIds?: string[],
): Promise<AggregateRow[]> {
  const organizationList = sql.join(
    organizationIds.map((organizationId) => sql`${organizationId}`),
    sql`, `,
  );
  const bucket = granularity ? localBucketExpression(granularity) : sql`null`;
  const groupBy = granularity ? sql`group by 1 order by 1` : sql``;
  const categoryList = categoryIds
    ? sql.join(
        categoryIds.map((categoryId) => sql`${categoryId}`),
        sql`, `,
      )
    : null;
  const categoryFilter = categoryList
    ? sql`
        and exists (
          select 1
          from product category_product
          left join product_category_link category_link
            on category_link.product_id = category_product.id
          where category_product.id = oi.product_id
            and (
              category_product.category_id in (${categoryList})
              or category_link.category_id in (${categoryList})
            )
        )
      `
    : sql``;

  const result = await fastify.db.execute<AggregateRow>(sql`
    with order_product_units as (
      select
        oi.order_id,
        coalesce(sum(oi.quantity), 0)::double precision as product_units
      from order_item oi
      inner join "order" product_order on product_order.id = oi.order_id
      where product_order.organization_id in (${organizationList})
        and product_order.created_at >= ${start}
        and product_order.created_at < ${end}
        ${categoryFilter}
      group by oi.order_id
    ),
    regular_free_modifier_values as (
      select
        oi.id as order_item_id,
        coalesce(
          sum(round(oim.unit_price_cents::numeric * oim.quantity * oi.free_units)),
          0
        )::bigint as modifier_value_cents
      from order_item oi
      inner join order_item_modifier oim on oim.order_item_id = oi.id
      where oi.free_units > 0
      group by oi.id
    ),
    compound_free_modifier_values as (
      select
        oi.id as order_item_id,
        coalesce(
          sum(round(
            coalesce(nullif(modifier.value ->> 'unitPriceCents', '')::numeric, 0)
            * coalesce(nullif(modifier.value ->> 'quantity', '')::numeric, 1)
            * component.quantity
            * oi.free_units
          )),
          0
        )::bigint as modifier_value_cents
      from order_item oi
      inner join order_item_compound_component component on component.order_item_id = oi.id
      cross join lateral jsonb_array_elements(component.modifiers_snapshot) modifier(value)
      where oi.free_units > 0
      group by oi.id
    ),
    order_free_values as (
      select
        oi.order_id,
        coalesce(sum(oi.free_units), 0)::integer as free_units,
        coalesce(sum(oi.promotion_discount_cents), 0)::bigint as retail_value_cents,
        coalesce(sum(least(
          oi.promotion_discount_cents,
          coalesce(regular.modifier_value_cents, 0)
            + coalesce(compound.modifier_value_cents, 0)
        )), 0)::bigint as modifier_value_cents
      from order_item oi
      left join regular_free_modifier_values regular on regular.order_item_id = oi.id
      left join compound_free_modifier_values compound on compound.order_item_id = oi.id
      group by oi.order_id
    )
    select
      ${bucket} as bucket,
      count(*)::integer as "orders",
      coalesce(sum(product_units.product_units), 0)::double precision as "productUnits",
      coalesce(sum(o.subtotal_cents + o.taxes_cents), 0)::bigint as "generatedSalesCents",
      coalesce(sum(greatest(o.subtotal_cents + o.taxes_cents - o.cashback_redemption_cents, 0)), 0)::bigint as "netCollectedCents",
      coalesce(sum(o.tip_cents), 0)::bigint as "tipsCents",
      count(*) filter (where coalesce(f.free_units, 0) > 0)::integer as "freeDrinkRedemptions",
      coalesce(sum(f.free_units), 0)::bigint as "freeDrinkUnits",
      coalesce(sum(f.retail_value_cents), 0)::bigint as "freeDrinkRetailValueCents",
      coalesce(sum(f.retail_value_cents - f.modifier_value_cents), 0)::bigint as "freeDrinkBeverageValueCents",
      coalesce(sum(f.modifier_value_cents), 0)::bigint as "freeDrinkModifierValueCents",
      count(*) filter (where o.cashback_redemption_cents > 0)::integer as "cashbackRedemptions",
      coalesce(sum(o.cashback_redemption_cents), 0)::bigint as "cashbackRedeemedCents",
      count(*) filter (where o.source = 'inplace')::integer as "inplaceOrders",
      coalesce(sum(o.subtotal_cents + o.taxes_cents) filter (where o.source = 'inplace'), 0)::bigint as "inplaceGeneratedSalesCents",
      coalesce(sum(greatest(o.subtotal_cents + o.taxes_cents - o.cashback_redemption_cents, 0)) filter (where o.source = 'inplace'), 0)::bigint as "inplaceNetCollectedCents",
      count(*) filter (where o.source = 'mobile')::integer as "mobileOrders",
      coalesce(sum(o.subtotal_cents + o.taxes_cents) filter (where o.source = 'mobile'), 0)::bigint as "mobileGeneratedSalesCents",
      coalesce(sum(greatest(o.subtotal_cents + o.taxes_cents - o.cashback_redemption_cents, 0)) filter (where o.source = 'mobile'), 0)::bigint as "mobileNetCollectedCents",
      count(*) filter (where o.source = 'admin')::integer as "adminOrders",
      coalesce(sum(o.subtotal_cents + o.taxes_cents) filter (where o.source = 'admin'), 0)::bigint as "adminGeneratedSalesCents",
      coalesce(sum(greatest(o.subtotal_cents + o.taxes_cents - o.cashback_redemption_cents, 0)) filter (where o.source = 'admin'), 0)::bigint as "adminNetCollectedCents",
      count(*) filter (where o.source = 'unknown')::integer as "unknownOrders",
      coalesce(sum(o.subtotal_cents + o.taxes_cents) filter (where o.source = 'unknown'), 0)::bigint as "unknownGeneratedSalesCents",
      coalesce(sum(greatest(o.subtotal_cents + o.taxes_cents - o.cashback_redemption_cents, 0)) filter (where o.source = 'unknown'), 0)::bigint as "unknownNetCollectedCents"
    from "order" o
    left join order_product_units product_units on product_units.order_id = o.id
    left join order_free_values f on f.order_id = o.id
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

async function loadTopModifierGroups(
  fastify: FastifyInstance,
  organizationIds: string[],
  start: Date,
  end: Date,
): Promise<DashboardModifierGroup[]> {
  const organizationList = sql.join(
    organizationIds.map((organizationId) => sql`${organizationId}`),
    sql`, `,
  );
  const result = await fastify.db.execute<ModifierRankingRow>(sql`
    with modifier_source as (
      select
        oim.modifier_id as modifier_id,
        oim.modifier_name as modifier_name,
        oim.modifier_option_id as modifier_option_id,
        oim.modifier_option_name as modifier_option_name,
        (oim.quantity * oi.quantity)::numeric as selection_units,
        (oim.quantity * greatest(oi.quantity - oi.free_units, 0))::numeric as paid_selection_units,
        round(
          oim.unit_price_cents::numeric
          * oim.quantity
          * greatest(oi.quantity - oi.free_units, 0)
        )::bigint as configured_extra_cents,
        o.created_at as order_created_at
      from order_item_modifier oim
      inner join order_item oi on oi.id = oim.order_item_id
      inner join "order" o on o.id = oi.order_id
      where o.organization_id in (${organizationList})
        and o.created_at >= ${start}
        and o.created_at < ${end}

      union all

      select
        modifier.value ->> 'modifierId' as modifier_id,
        modifier.value ->> 'modifierName' as modifier_name,
        modifier.value ->> 'modifierOptionId' as modifier_option_id,
        modifier.value ->> 'modifierOptionName' as modifier_option_name,
        (
          coalesce(nullif(modifier.value ->> 'quantity', '')::numeric, 1)
          * component.quantity
          * oi.quantity
        )::numeric as selection_units,
        (
          coalesce(nullif(modifier.value ->> 'quantity', '')::numeric, 1)
          * component.quantity
          * greatest(oi.quantity - oi.free_units, 0)
        )::numeric as paid_selection_units,
        round(
          coalesce(nullif(modifier.value ->> 'unitPriceCents', '')::numeric, 0)
          * coalesce(nullif(modifier.value ->> 'quantity', '')::numeric, 1)
          * component.quantity
          * greatest(oi.quantity - oi.free_units, 0)
        )::bigint as configured_extra_cents,
        o.created_at as order_created_at
      from order_item_compound_component component
      inner join order_item oi on oi.id = component.order_item_id
      inner join "order" o on o.id = oi.order_id
      cross join lateral jsonb_array_elements(component.modifiers_snapshot) modifier(value)
      where o.organization_id in (${organizationList})
        and o.created_at >= ${start}
        and o.created_at < ${end}
    ),
    option_stats as (
      select
        modifier_id,
        (array_agg(modifier_name order by order_created_at desc))[1] as modifier_name,
        modifier_option_id,
        (array_agg(modifier_option_name order by order_created_at desc))[1] as modifier_option_name,
        sum(selection_units)::double precision as option_selection_units,
        sum(paid_selection_units)::double precision as option_paid_selection_units,
        sum(configured_extra_cents)::bigint as option_configured_extra_cents
      from modifier_source
      where modifier_id is not null
        and modifier_option_id is not null
      group by modifier_id, modifier_option_id
    ),
    group_stats as (
      select
        modifier_id,
        max(modifier_name) as modifier_name,
        sum(option_selection_units)::double precision as group_selection_units,
        sum(option_paid_selection_units)::double precision as group_paid_selection_units,
        sum(option_configured_extra_cents)::bigint as group_configured_extra_cents
      from option_stats
      group by modifier_id
    ),
    ranked_groups as (
      select *, row_number() over (
        order by group_selection_units desc, group_configured_extra_cents desc, modifier_name asc
      ) as group_rank
      from group_stats
    ),
    ranked_options as (
      select *, row_number() over (
        partition by modifier_id
        order by option_selection_units desc, option_configured_extra_cents desc, modifier_option_name asc
      ) as option_rank
      from option_stats
    )
    select
      groups.modifier_id as "modifierId",
      groups.modifier_name as "modifierName",
      options.modifier_option_id as "modifierOptionId",
      options.modifier_option_name as "modifierOptionName",
      groups.group_selection_units as "groupSelectionUnits",
      groups.group_paid_selection_units as "groupPaidSelectionUnits",
      groups.group_configured_extra_cents as "groupConfiguredExtraCents",
      options.option_selection_units as "optionSelectionUnits",
      options.option_paid_selection_units as "optionPaidSelectionUnits",
      options.option_configured_extra_cents as "optionConfiguredExtraCents"
    from ranked_groups groups
    inner join ranked_options options on options.modifier_id = groups.modifier_id
    where groups.group_rank <= 8
      and options.option_rank <= 8
    order by groups.group_rank, options.option_rank
  `);

  const groups = new Map<string, DashboardModifierGroup>();
  for (const row of result.rows) {
    const group = groups.get(row.modifierId) ?? {
      modifierId: row.modifierId,
      name: row.modifierName,
      selectionUnits: toNumber(row.groupSelectionUnits),
      paidSelectionUnits: toNumber(row.groupPaidSelectionUnits),
      configuredExtraCents: toInteger(row.groupConfiguredExtraCents),
      options: [],
    };
    group.options.push({
      modifierOptionId: row.modifierOptionId,
      name: row.modifierOptionName,
      selectionUnits: toNumber(row.optionSelectionUnits),
      paidSelectionUnits: toNumber(row.optionPaidSelectionUnits),
      configuredExtraCents: toInteger(row.optionConfiguredExtraCents),
    });
    groups.set(row.modifierId, group);
  }

  return [...groups.values()];
}

async function loadTopVariationGroups(
  fastify: FastifyInstance,
  organizationIds: string[],
  start: Date,
  end: Date,
): Promise<DashboardVariationGroup[]> {
  const organizationList = sql.join(
    organizationIds.map((organizationId) => sql`${organizationId}`),
    sql`, `,
  );
  const result = await fastify.db.execute<VariationRankingRow>(sql`
    with snapshot_source as (
      select
        selection.value ->> 'groupId' as variation_group_id,
        selection.value ->> 'groupName' as variation_group_name,
        selection.value ->> 'optionId' as variation_option_id,
        selection.value ->> 'optionName' as variation_option_name,
        w.quantity_snapshot::numeric as selection_units,
        (
          oi.grand_total_cents::numeric
          * w.quantity_snapshot
          / nullif(oi.quantity, 0)
        )::numeric as associated_sales_cents,
        o.created_at as order_created_at
      from work_order w
      inner join "order" o on o.id = w.order_id
      inner join order_item oi on oi.id = w.order_item_id
      cross join lateral jsonb_array_elements(w.variation_selections_snapshot) selection(value)
      where o.organization_id in (${organizationList})
        and o.created_at >= ${start}
        and o.created_at < ${end}
    ),
    fallback_source as (
      select
        selected.variation_group_id,
        variation_group.name as variation_group_name,
        selected.variation_option_id,
        variation_option.name as variation_option_name,
        oi.quantity::numeric as selection_units,
        oi.grand_total_cents::numeric as associated_sales_cents,
        o.created_at as order_created_at
      from order_item oi
      inner join "order" o on o.id = oi.order_id
      inner join variation_selection selected on selected.variation_id = oi.variation_id
      inner join variation_group on variation_group.id = selected.variation_group_id
      inner join variation_group_option variation_option on variation_option.id = selected.variation_option_id
      where o.organization_id in (${organizationList})
        and o.created_at >= ${start}
        and o.created_at < ${end}
        and not exists (
          select 1
          from work_order snapshot
          where snapshot.order_item_id = oi.id
            and jsonb_array_length(snapshot.variation_selections_snapshot) > 0
        )
    ),
    variation_source as (
      select * from snapshot_source
      union all
      select * from fallback_source
    ),
    option_stats as (
      select
        variation_group_id,
        (array_agg(variation_group_name order by order_created_at desc))[1] as variation_group_name,
        variation_option_id,
        (array_agg(variation_option_name order by order_created_at desc))[1] as variation_option_name,
        sum(selection_units)::double precision as option_selection_units,
        round(sum(associated_sales_cents))::bigint as option_associated_sales_cents
      from variation_source
      where variation_group_id is not null
        and variation_option_id is not null
      group by variation_group_id, variation_option_id
    ),
    group_stats as (
      select
        variation_group_id,
        max(variation_group_name) as variation_group_name,
        sum(option_selection_units)::double precision as group_selection_units,
        sum(option_associated_sales_cents)::bigint as group_associated_sales_cents
      from option_stats
      group by variation_group_id
    ),
    ranked_groups as (
      select *, row_number() over (
        order by group_selection_units desc, group_associated_sales_cents desc, variation_group_name asc
      ) as group_rank
      from group_stats
    ),
    ranked_options as (
      select *, row_number() over (
        partition by variation_group_id
        order by option_selection_units desc, option_associated_sales_cents desc, variation_option_name asc
      ) as option_rank
      from option_stats
    )
    select
      groups.variation_group_id as "variationGroupId",
      groups.variation_group_name as "variationGroupName",
      options.variation_option_id as "variationOptionId",
      options.variation_option_name as "variationOptionName",
      groups.group_selection_units as "groupSelectionUnits",
      groups.group_associated_sales_cents as "groupAssociatedSalesCents",
      options.option_selection_units as "optionSelectionUnits",
      options.option_associated_sales_cents as "optionAssociatedSalesCents"
    from ranked_groups groups
    inner join ranked_options options on options.variation_group_id = groups.variation_group_id
    where groups.group_rank <= 8
      and options.option_rank <= 8
    order by groups.group_rank, options.option_rank
  `);

  const groups = new Map<string, DashboardVariationGroup>();
  for (const row of result.rows) {
    const group = groups.get(row.variationGroupId) ?? {
      variationGroupId: row.variationGroupId,
      name: row.variationGroupName,
      selectionUnits: toNumber(row.groupSelectionUnits),
      associatedSalesCents: toInteger(row.groupAssociatedSalesCents),
      options: [],
    };
    group.options.push({
      variationOptionId: row.variationOptionId,
      name: row.variationOptionName,
      selectionUnits: toNumber(row.optionSelectionUnits),
      associatedSalesCents: toInteger(row.optionAssociatedSalesCents),
    });
    groups.set(row.variationGroupId, group);
  }

  return [...groups.values()];
}

function formatBucket(
  value: string | Date,
  granularity: "hour" | "day" | "month",
): string {
  const formatted =
    value instanceof Date
      ? granularity === "hour"
        ? value.toISOString().slice(0, 13) + ":00:00"
        : value.toISOString().slice(0, 10)
      : granularity === "hour"
        ? value.slice(0, 19)
        : value.slice(0, 10);
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

      const categoryFilterIds = await resolveCategoryFilterIds(fastify, input.categoryIds);

      const [
        aggregateRows,
        previousRows,
        topProducts,
        topModifierGroups,
        topVariationGroups,
      ] = await Promise.all([
        loadAggregate(
          fastify,
          organizationIds,
          range.start.toDate(),
          range.effectiveEnd.toDate(),
          range.granularity,
          categoryFilterIds,
        ),
        loadAggregate(
          fastify,
          organizationIds,
          range.comparisonStart.toDate(),
          range.comparisonEnd.toDate(),
          undefined,
          categoryFilterIds,
        ),
        loadTopProducts(
          fastify,
          organizationIds,
          range.start.toDate(),
          range.effectiveEnd.toDate(),
        ),
        loadTopModifierGroups(
          fastify,
          organizationIds,
          range.start.toDate(),
          range.effectiveEnd.toDate(),
        ),
        loadTopVariationGroups(
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
      const buckets = listDashboardBuckets(range);
      const timeline = buckets.map((bucket) => {
        const row = aggregatesByBucket.get(bucket);
        return row ? normalizeAggregate(row, bucket) : emptyTimelineItem(bucket);
      });
      const orderSources = buildOrderSources(buckets, aggregatesByBucket);
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
          productUnits: buildMetric(current.productUnits, previous.productUnits),
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
        topModifierGroups,
        topVariationGroups,
        orderSources,
      };
    },
  };
}
