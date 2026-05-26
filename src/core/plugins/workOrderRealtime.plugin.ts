import { workOrdersDB } from "@core/db/schemas";
import fastifyWebsocket, { type WebSocket } from "@fastify/websocket";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type pg from "pg";

type WorkOrderEventType = "workOrder.created" | "workOrder.completed";

interface WorkOrderEventPayload {
  type: WorkOrderEventType;
  organizationId: string;
  workOrderId: string;
}

interface RegisterWorkOrderRealtimeConnectionInput {
  organizationId: string;
  socket: WebSocket;
}

export interface WorkOrderRealtimeRegistry {
  registerConnection(input: RegisterWorkOrderRealtimeConnectionInput): () => void;
}

declare module "fastify" {
  interface FastifyInstance {
    workOrderRealtime: WorkOrderRealtimeRegistry;
  }
}

function parseWorkOrderEvent(payload: string | undefined): WorkOrderEventPayload | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Partial<WorkOrderEventPayload>;

    if (
      (parsed.type === "workOrder.created" || parsed.type === "workOrder.completed") &&
      typeof parsed.organizationId === "string" &&
      typeof parsed.workOrderId === "string"
    ) {
      return {
        type: parsed.type,
        organizationId: parsed.organizationId,
        workOrderId: parsed.workOrderId,
      };
    }
  } catch {
    return null;
  }

  return null;
}

const workOrderRealtimePlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyWebsocket);

  const socketsByOrganization = new Map<string, Set<WebSocket>>();

  const sendToOrganization = async (event: WorkOrderEventPayload) => {
    const sockets = socketsByOrganization.get(event.organizationId);

    if (!sockets || sockets.size === 0) {
      fastify.log.debug({ event }, "Work order realtime event skipped: no sockets");
      return;
    }

    const workOrder = await fastify.db.query.workOrdersDB.findFirst({
      where: eq(workOrdersDB.id, event.workOrderId),
    });

    if (!workOrder || workOrder.organizationId !== event.organizationId) {
      fastify.log.warn({ event }, "Work order realtime event skipped: work order not found");
      return;
    }

    const message = JSON.stringify({
      type: event.type,
      data: workOrder,
    });
    let sentCount = 0;

    for (const socket of sockets) {
      if (socket.readyState === 1) {
        socket.send(message);
        sentCount += 1;
      } else {
        sockets.delete(socket);
      }
    }

    if (sockets.size === 0) {
      socketsByOrganization.delete(event.organizationId);
    }

    fastify.log.debug({ event, sentCount }, "Work order realtime event broadcasted");
  };

  fastify.decorate("workOrderRealtime", {
    registerConnection({ organizationId, socket }) {
      const sockets = socketsByOrganization.get(organizationId) ?? new Set<WebSocket>();

      sockets.add(socket);
      socketsByOrganization.set(organizationId, sockets);

      fastify.log.info(
        { organizationId, socketCount: sockets.size },
        "Work order realtime socket connected",
      );

      return () => {
        sockets.delete(socket);

        if (sockets.size === 0) {
          socketsByOrganization.delete(organizationId);
        }

        fastify.log.info(
          { organizationId, socketCount: sockets.size },
          "Work order realtime socket disconnected",
        );
      };
    },
  });

  const client = await fastify.pg.connect();

  const notificationHandler = (notification: pg.Notification) => {
    if (notification.channel !== "work_order_events") {
      return;
    }

    const event = parseWorkOrderEvent(notification.payload);

    if (!event) {
      fastify.log.warn({ payload: notification.payload }, "Invalid work order realtime payload");
      return;
    }

    fastify.log.debug({ event }, "Work order realtime notification received");

    sendToOrganization(event).catch((error) => {
      fastify.log.error({ err: error, event }, "Failed to broadcast work order event");
    });
  };

  client.on("notification", notificationHandler);
  await client.query("LISTEN work_order_events");

  fastify.addHook("onClose", async () => {
    for (const sockets of socketsByOrganization.values()) {
      for (const socket of sockets) {
        socket.close(1001, "Server shutting down");
      }
    }

    socketsByOrganization.clear();
    client.off("notification", notificationHandler);
    await client.query("UNLISTEN work_order_events");
    client.release();
  });

  fastify.log.info("Work order realtime initialized");
};

export default fp(workOrderRealtimePlugin, {
  name: "work-order-realtime",
  dependencies: ["db", "auth"],
});
