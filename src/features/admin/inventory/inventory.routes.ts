import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import {
  activateLocation,
  createAdjustment,
  createDistributionCenter,
  deactivateLocation,
  getActivationPreview,
  getSummary,
  getProductInventoryConfiguration,
  listAdjustments,
  listItems,
  listLocations,
  listLots,
  listStocks,
  reverseAdjustment,
  updateItemConfiguration,
  updateProductInventoryConfiguration,
  updateLocationItem,
  listAvailabilityOverrides,
  listAvailabilityTargets,
  createAvailabilityOverride,
  clearAvailabilityOverride,
} from "./inventory.controllers";
import {
  activationBodySchema,
  adjustmentParamsSchema,
  createAdjustmentBodySchema,
  createDistributionCenterBodySchema,
  deactivationBodySchema,
  itemParamsSchema,
  locationParamsSchema,
  lotsQuerySchema,
  updateItemConfigurationBodySchema,
  productParamsSchema,
  updateProductConfigurationBodySchema,
  type ActivationBody,
  type AdjustmentParams,
  type CreateAdjustmentBody,
  type CreateDistributionCenterBody,
  type DeactivationBody,
  type ItemParams,
  type LocationParams,
  type LotsQuery,
  type UpdateItemConfigurationBody,
  type ProductParams,
  type UpdateProductConfigurationBody,
  locationItemParamsSchema,
  overrideParamsSchema,
  updateLocationItemBodySchema,
  createAvailabilityOverrideBodySchema,
  type LocationItemParams,
  type OverrideParams,
  type UpdateLocationItemBody,
  type CreateAvailabilityOverrideBody,
} from "./inventory.schemas";

export async function adminInventoryRoutes(server: FastifyInstance) {
  const canRead = adminAuthHandler({
    roles: ["owner", "admin", "member"],
    permissions: { inventory: ["read"] },
  });
  const canAdjust = adminAuthHandler({
    roles: ["owner", "admin"],
    permissions: { inventory: ["adjust"] },
  });
  const canManage = adminAuthHandler({
    roles: ["owner", "admin"],
    permissions: { inventory: ["manage"] },
  });

  server.get("/locations", { preHandler: [canRead] }, listLocations);
  server.post<{ Body: CreateDistributionCenterBody }>(
    "/locations/distribution-centers",
    { preHandler: [canManage], schema: { body: createDistributionCenterBodySchema } },
    createDistributionCenter,
  );
  server.get("/items", { preHandler: [canRead] }, listItems);
  server.patch<{ Params: ItemParams; Body: UpdateItemConfigurationBody }>(
    "/items/:inventoryItemId/configuration",
    {
      preHandler: [canManage],
      schema: { params: itemParamsSchema, body: updateItemConfigurationBodySchema },
    },
    updateItemConfiguration,
  );
  server.get<{ Params: ProductParams }>(
    "/products/:productId/configuration",
    { preHandler: [canRead], schema: { params: productParamsSchema } },
    getProductInventoryConfiguration,
  );
  server.put<{ Params: ProductParams; Body: UpdateProductConfigurationBody }>(
    "/products/:productId/configuration",
    {
      preHandler: [canManage],
      schema: { params: productParamsSchema, body: updateProductConfigurationBodySchema },
    },
    updateProductInventoryConfiguration,
  );
  server.get<{ Params: LocationParams }>(
    "/locations/:locationId/summary",
    { preHandler: [canRead], schema: { params: locationParamsSchema } },
    getSummary,
  );
  server.get(
    "/availability-targets",
    { preHandler: [canRead] },
    listAvailabilityTargets,
  );
  server.patch<{ Params: LocationItemParams; Body: UpdateLocationItemBody }>(
    "/locations/:locationId/items/:inventoryItemId",
    {
      preHandler: [canManage],
      schema: { params: locationItemParamsSchema, body: updateLocationItemBodySchema },
    },
    updateLocationItem,
  );
  server.get<{ Params: LocationParams }>(
    "/locations/:locationId/availability-overrides",
    { preHandler: [canRead], schema: { params: locationParamsSchema } },
    listAvailabilityOverrides,
  );
  server.post<{ Params: LocationParams; Body: CreateAvailabilityOverrideBody }>(
    "/locations/:locationId/availability-overrides",
    {
      preHandler: [canManage],
      schema: {
        params: locationParamsSchema,
        body: createAvailabilityOverrideBodySchema,
      },
    },
    createAvailabilityOverride,
  );
  server.delete<{ Params: OverrideParams }>(
    "/locations/:locationId/availability-overrides/:overrideId",
    { preHandler: [canManage], schema: { params: overrideParamsSchema } },
    clearAvailabilityOverride,
  );
  server.get<{ Params: LocationParams }>(
    "/locations/:locationId/stocks",
    { preHandler: [canRead], schema: { params: locationParamsSchema } },
    listStocks,
  );
  server.get<{ Params: LocationParams; Querystring: LotsQuery }>(
    "/locations/:locationId/lots",
    {
      preHandler: [canRead],
      schema: { params: locationParamsSchema, querystring: lotsQuerySchema },
    },
    listLots,
  );
  server.get<{ Params: LocationParams }>(
    "/locations/:locationId/adjustments",
    { preHandler: [canRead], schema: { params: locationParamsSchema } },
    listAdjustments,
  );
  server.post<{ Params: LocationParams; Body: CreateAdjustmentBody }>(
    "/locations/:locationId/adjustments",
    {
      preHandler: [canAdjust],
      schema: { params: locationParamsSchema, body: createAdjustmentBodySchema },
    },
    createAdjustment,
  );
  server.post<{ Params: AdjustmentParams }>(
    "/locations/:locationId/adjustments/:adjustmentId/reverse",
    { preHandler: [canAdjust], schema: { params: adjustmentParamsSchema } },
    reverseAdjustment,
  );
  server.get<{ Params: LocationParams }>(
    "/locations/:locationId/activation-preview",
    { preHandler: [canManage], schema: { params: locationParamsSchema } },
    getActivationPreview,
  );
  server.post<{ Params: LocationParams; Body: ActivationBody }>(
    "/locations/:locationId/activate",
    {
      preHandler: [canManage],
      schema: { params: locationParamsSchema, body: activationBodySchema },
    },
    activateLocation,
  );
  server.post<{ Params: LocationParams; Body: DeactivationBody }>(
    "/locations/:locationId/deactivate",
    {
      preHandler: [canManage],
      schema: { params: locationParamsSchema, body: deactivationBodySchema },
    },
    deactivateLocation,
  );
}
