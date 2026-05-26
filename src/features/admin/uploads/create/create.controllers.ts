import type { FastifyReply, FastifyRequest } from "fastify";

import { unauthorized } from "@core/utils";
import { parseCreateUploadsMultipartRequest } from "../uploads.helpers";

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const payload = await parseCreateUploadsMultipartRequest(request);
  const organizationId = request.auth.member.organizationId;

  if (!organizationId) {
    throw unauthorized(
      "auth.noActiveOrganization",
      "No active organization is selected for this session",
    );
  }

  const createdUploads = await request.server.admin.uploads.create({
    organizationId,
    visibility: payload.visibility,
    files: payload.files,
    optimization: payload.optimization,
  });

  return reply.status(201).send({
    data: createdUploads,
  });
}
