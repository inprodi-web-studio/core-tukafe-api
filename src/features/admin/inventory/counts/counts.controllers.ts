import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  AddCountLotBody,
  CountLocation,
  CountParams,
  CountVersionBody,
  CreateCountBody,
  ListCountsQuery,
  RefreshCountBody,
  SaveCountBody,
} from "./counts.schemas";

const context = (request: FastifyRequest) => ({
  userId: request.auth.user.id,
  organizationId: request.auth.member.organizationId,
});
export async function listCounts(
  request: FastifyRequest<{ Params: CountLocation; Querystring: ListCountsQuery }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventoryCounts.list({
      ...context(request),
      ...request.params,
      ...request.query,
    }),
  );
}
export async function createCount(
  request: FastifyRequest<{ Params: CountLocation; Body: CreateCountBody }>,
  reply: FastifyReply,
) {
  return reply.status(201).send(
    await request.server.admin.inventoryCounts.create({
      ...context(request),
      ...request.params,
      ...request.body,
    }),
  );
}
export async function getCount(
  request: FastifyRequest<{ Params: CountParams }>,
  reply: FastifyReply,
) {
  return reply
    .status(200)
    .send(
      await request.server.admin.inventoryCounts.get({ ...context(request), ...request.params }),
    );
}
export async function saveCount(
  request: FastifyRequest<{ Params: CountParams; Body: SaveCountBody }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventoryCounts.save({
      ...context(request),
      ...request.params,
      ...request.body,
    }),
  );
}
export async function addCountLot(
  request: FastifyRequest<{ Params: CountParams; Body: AddCountLotBody }>,
  reply: FastifyReply,
) {
  return reply.status(201).send(
    await request.server.admin.inventoryCounts.addLot({
      ...context(request),
      ...request.params,
      ...request.body,
    }),
  );
}
export async function refreshCount(
  request: FastifyRequest<{ Params: CountParams; Body: RefreshCountBody }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventoryCounts.refresh({
      ...context(request),
      ...request.params,
      ...request.body,
    }),
  );
}
export async function applyCount(
  request: FastifyRequest<{ Params: CountParams; Body: CountVersionBody }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventoryCounts.apply({
      ...context(request),
      ...request.params,
      ...request.body,
    }),
  );
}
export async function cancelCount(
  request: FastifyRequest<{ Params: CountParams; Body: CountVersionBody }>,
  reply: FastifyReply,
) {
  return reply.status(200).send(
    await request.server.admin.inventoryCounts.cancel({
      ...context(request),
      ...request.params,
      ...request.body,
    }),
  );
}
