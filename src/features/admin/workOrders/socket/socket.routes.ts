import { fromNodeHeaders } from "better-auth/node";
import type { WebSocket } from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest } from "fastify";

interface SocketAuthResult {
  organizationId: string;
}

function sendSocketError(socket: WebSocket, code: string, message: string) {
  socket.send(
    JSON.stringify({
      type: "error",
      code,
      message,
    }),
  );
}

async function authenticateSocketRequest(request: FastifyRequest): Promise<SocketAuthResult> {
  const headers = fromNodeHeaders(request.headers);
  const headerSession = await request.server.auth.api.getSession({
    headers,
  });

  if (!headerSession) {
    throw new Error("auth.noSession");
  }

  const organizationId = headerSession.session.activeOrganizationId;

  if (!organizationId) {
    throw new Error("auth.noActiveOrganization");
  }

  const member = await request.server.db.query.memberDB.findFirst({
    where(memberDB, { and, eq }) {
      return and(
        eq(memberDB.userId, headerSession.user.id),
        eq(memberDB.organizationId, organizationId),
      );
    },
  });

  if (!member) {
    throw new Error("auth.noMember");
  }

  const activeOrganization = await request.server.db.query.organizationDB.findFirst({
    where(table, { and, eq, isNull }) {
      return and(eq(table.id, organizationId), isNull(table.deletedAt));
    },
    columns: { id: true },
  });

  if (!activeOrganization) {
    throw new Error("organization.inactive");
  }

  const { success } = await request.server.auth.api.hasPermission({
    headers,
    body: {
      permissions: {
        orders: ["read"],
      },
    },
  });

  if (!success) {
    throw new Error("user.noPermissions");
  }

  return {
    organizationId,
  };
}

export async function socketRoutes(server: FastifyInstance) {
  server.get(
    "/socket",
    {
      websocket: true,
    },
    async (socket, request) => {
      try {
        const { organizationId } = await authenticateSocketRequest(request);
        const cleanup = request.server.workOrderRealtime.registerConnection({
          organizationId,
          socket,
        });

        socket.once("close", cleanup);
        socket.once("error", cleanup);
        socket.send(
          JSON.stringify({
            type: "connected",
            organizationId,
          }),
        );
      } catch (error) {
        const code = error instanceof Error ? error.message : "auth.unauthorized";

        sendSocketError(socket, code, "Failed to authenticate realtime connection");
        socket.close(1008, "Unauthorized");
      }
    },
  );
}
