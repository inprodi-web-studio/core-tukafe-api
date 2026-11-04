import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import {
  addCountLot,
  applyCount,
  cancelCount,
  createCount,
  getCount,
  listCounts,
  refreshCount,
  saveCount,
} from "./counts.controllers";
import {
  addCountLotSchema,
  countDetailSchema,
  countListResponseSchema,
  countLocationSchema,
  countParamsSchema,
  countVersionSchema,
  createCountSchema,
  listCountsSchema,
  refreshCountSchema,
  saveCountSchema,
} from "./counts.schemas";
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

export async function adminInventoryCountsRoutes(server: FastifyInstance) {
  const canRead = adminAuthHandler({
    roles: ["owner", "admin"],
    permissions: { inventory: ["read"] },
  });
  const canAdjust = adminAuthHandler({
    roles: ["owner", "admin"],
    permissions: { inventory: ["adjust"] },
  });
  server.get<{ Params: CountLocation; Querystring: ListCountsQuery }>(
    "/locations/:locationId/counts",
    {
      preHandler: [canRead],
      schema: {
        params: countLocationSchema,
        querystring: listCountsSchema,
        response: { 200: countListResponseSchema },
      },
    },
    listCounts,
  );
  server.post<{ Params: CountLocation; Body: CreateCountBody }>(
    "/locations/:locationId/counts",
    {
      preHandler: [canAdjust],
      schema: {
        params: countLocationSchema,
        body: createCountSchema,
        response: { 201: countDetailSchema },
      },
    },
    createCount,
  );
  server.get<{ Params: CountParams }>(
    "/locations/:locationId/counts/:countId",
    {
      preHandler: [canRead],
      schema: { params: countParamsSchema, response: { 200: countDetailSchema } },
    },
    getCount,
  );
  server.put<{ Params: CountParams; Body: SaveCountBody }>(
    "/locations/:locationId/counts/:countId",
    {
      preHandler: [canAdjust],
      schema: {
        params: countParamsSchema,
        body: saveCountSchema,
        response: { 200: countDetailSchema },
      },
    },
    saveCount,
  );
  server.post<{ Params: CountParams; Body: AddCountLotBody }>(
    "/locations/:locationId/counts/:countId/lines",
    {
      preHandler: [canAdjust],
      schema: {
        params: countParamsSchema,
        body: addCountLotSchema,
        response: { 201: countDetailSchema },
      },
    },
    addCountLot,
  );
  server.post<{ Params: CountParams; Body: RefreshCountBody }>(
    "/locations/:locationId/counts/:countId/refresh",
    {
      preHandler: [canAdjust],
      schema: {
        params: countParamsSchema,
        body: refreshCountSchema,
        response: { 200: countDetailSchema },
      },
    },
    refreshCount,
  );
  server.post<{ Params: CountParams; Body: CountVersionBody }>(
    "/locations/:locationId/counts/:countId/apply",
    {
      preHandler: [canAdjust],
      schema: {
        params: countParamsSchema,
        body: countVersionSchema,
        response: { 200: countDetailSchema },
      },
    },
    applyCount,
  );
  server.post<{ Params: CountParams; Body: CountVersionBody }>(
    "/locations/:locationId/counts/:countId/cancel",
    {
      preHandler: [canAdjust],
      schema: {
        params: countParamsSchema,
        body: countVersionSchema,
        response: { 200: countDetailSchema },
      },
    },
    cancelCount,
  );
}
