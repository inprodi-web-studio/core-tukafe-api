import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  ActivationBody,
  AdjustmentParams,
  CreateAdjustmentBody,
  CreateDistributionCenterBody,
  DeactivationBody,
  ItemParams,
  LocationParams,
  LotsQuery,
  UpdateItemConfigurationBody,
  ProductParams,
  UpdateProductConfigurationBody,
  LocationItemParams,
  OverrideParams,
  UpdateLocationItemBody,
  CreateAvailabilityOverrideBody,
} from "./inventory.schemas";

function context(request: FastifyRequest) {
  return {
    userId: request.auth.user.id,
    organizationId: request.auth.member.organizationId,
  };
}

export async function listLocations(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send(await request.server.admin.inventory.listLocations(context(request)));
}

export async function createDistributionCenter(
  request: FastifyRequest<{ Body: CreateDistributionCenterBody }>,
  reply: FastifyReply,
) {
  const location = await request.server.admin.inventory.createDistributionCenter({
    ...context(request),
    ...request.body,
  });
  return reply.status(201).send(location);
}

export async function listItems(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(200).send(await request.server.admin.inventory.listItems(context(request)));
}

export async function updateItemConfiguration(
  request: FastifyRequest<{ Params: ItemParams; Body: UpdateItemConfigurationBody }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.updateItemConfiguration({
      ...context(request),
      inventoryItemId: request.params.inventoryItemId,
      ...request.body,
    }),
  );
}

export async function getProductInventoryConfiguration(
  request: FastifyRequest<{ Params: ProductParams }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.getProductConfiguration({
      ...context(request),
      productId: request.params.productId,
    }),
  );
}

export async function updateProductInventoryConfiguration(
  request: FastifyRequest<{
    Params: ProductParams;
    Body: UpdateProductConfigurationBody;
  }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.updateProductConfiguration({
      ...context(request),
      productId: request.params.productId,
      ...request.body,
    }),
  );
}

export async function listStocks(
  request: FastifyRequest<{ Params: LocationParams }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.listStocks({
      ...context(request),
      locationId: request.params.locationId,
    }),
  );
}

export async function updateLocationItem(
  request: FastifyRequest<{ Params: LocationItemParams; Body: UpdateLocationItemBody }>,
  reply: FastifyReply,
) {
  await request.server.admin.inventory.updateLocationItem({
    ...context(request),
    ...request.params,
    ...request.body,
  });
  return reply.status(204).send();
}

export async function listAvailabilityOverrides(
  request: FastifyRequest<{ Params: LocationParams }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.listAvailabilityOverrides({
      ...context(request),
      locationId: request.params.locationId,
    }),
  );
}

export async function listAvailabilityTargets(request: FastifyRequest, reply: FastifyReply) {
  return reply
    .status(200)
    .send(await request.server.admin.inventory.listAvailabilityTargets());
}

export async function createAvailabilityOverride(
  request: FastifyRequest<{
    Params: LocationParams;
    Body: CreateAvailabilityOverrideBody;
  }>,
  reply: FastifyReply,
) {
  return reply.status(201).send(
    await request.server.admin.inventory.createAvailabilityOverride({
      ...context(request),
      locationId: request.params.locationId,
      ...request.body,
    }),
  );
}

export async function clearAvailabilityOverride(
  request: FastifyRequest<{ Params: OverrideParams }>,
  reply: FastifyReply,
) {
  await request.server.admin.inventory.clearAvailabilityOverride({
    ...context(request),
    ...request.params,
  });
  return reply.status(204).send();
}

export async function listLots(
  request: FastifyRequest<{ Params: LocationParams; Querystring: LotsQuery }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.listLots({
      ...context(request),
      locationId: request.params.locationId,
      inventoryItemId: request.query.inventoryItemId,
    }),
  );
}

export async function getSummary(
  request: FastifyRequest<{ Params: LocationParams }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.getSummary({
      ...context(request),
      locationId: request.params.locationId,
    }),
  );
}

export async function listAdjustments(
  request: FastifyRequest<{ Params: LocationParams }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.listAdjustments({
      ...context(request),
      locationId: request.params.locationId,
    }),
  );
}

export async function createAdjustment(
  request: FastifyRequest<{ Params: LocationParams; Body: CreateAdjustmentBody }>,
  reply: FastifyReply,
) {
  const adjustment = await request.server.admin.inventory.createAdjustment({
    ...context(request),
    locationId: request.params.locationId,
    ...request.body,
  });
  return reply.status(201).send(adjustment);
}

export async function reverseAdjustment(
  request: FastifyRequest<{ Params: AdjustmentParams }>,
  reply: FastifyReply,
) {
  return reply.status(201).send(
    await request.server.admin.inventory.reverseAdjustment({
      ...context(request),
      ...request.params,
    }),
  );
}

export async function getActivationPreview(
  request: FastifyRequest<{ Params: LocationParams }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.getActivationPreview({
      ...context(request),
      locationId: request.params.locationId,
    }),
  );
}

export async function activateLocation(
  request: FastifyRequest<{ Params: LocationParams; Body: ActivationBody }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.activateLocation({
      ...context(request),
      locationId: request.params.locationId,
      ...request.body,
    }),
  );
}

export async function deactivateLocation(
  request: FastifyRequest<{ Params: LocationParams; Body: DeactivationBody }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventory.deactivateLocation({
      ...context(request),
      locationId: request.params.locationId,
      reason: request.body.reason,
    }),
  );
}
