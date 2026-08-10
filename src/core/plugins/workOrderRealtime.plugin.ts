import { workOrdersDB } from "@core/db/schemas";
import { attachWorkOrderDetails } from "@features/admin/workOrders/workOrders.service";
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

interface NotificationListenerConnection {
  client: pg.PoolClient;
  onError: (error: Error) => void;
  onEnd: () => void;
}

const SOCKET_HEARTBEAT_INTERVAL_MS = 25_000;
const LISTENER_RECONNECT_MAX_DELAY_MS = 30_000;

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
  const socketLiveness = new WeakMap<WebSocket, boolean>();
  const socketCleanup = new WeakMap<WebSocket, () => void>();

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

    const [workOrderResponse] = await attachWorkOrderDetails(fastify, [workOrder]);

    const message = JSON.stringify({
      type: event.type,
      data: workOrderResponse ?? workOrder,
    });
    let sentCount = 0;

    for (const socket of [...sockets]) {
      if (socket.readyState === 1) {
        try {
          socket.send(message, (error?: Error) => {
            if (!error) {
              return;
            }

            fastify.log.warn(
              { err: error, organizationId: event.organizationId },
              "Failed to send work order realtime event",
            );
            socketCleanup.get(socket)?.();
            socket.terminate();
          });
          sentCount += 1;
        } catch (error) {
          fastify.log.warn(
            { err: error, organizationId: event.organizationId },
            "Failed to send work order realtime event",
          );
          socketCleanup.get(socket)?.();
          socket.terminate();
        }
      } else {
        socketCleanup.get(socket)?.();
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
      let cleanedUp = false;
      const markAlive = () => socketLiveness.set(socket, true);

      sockets.add(socket);
      socketsByOrganization.set(organizationId, sockets);
      socketLiveness.set(socket, true);
      socket.on("pong", markAlive);

      fastify.log.info(
        { organizationId, socketCount: sockets.size },
        "Work order realtime socket connected",
      );

      const cleanup = () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        socket.off("pong", markAlive);
        socketLiveness.delete(socket);
        socketCleanup.delete(socket);
        sockets.delete(socket);

        if (sockets.size === 0) {
          socketsByOrganization.delete(organizationId);
        }

        fastify.log.info(
          { organizationId, socketCount: sockets.size },
          "Work order realtime socket disconnected",
        );
      };

      socketCleanup.set(socket, cleanup);
      return cleanup;
    },
  });

  const heartbeatTimer = setInterval(() => {
    for (const [organizationId, sockets] of socketsByOrganization) {
      for (const socket of [...sockets]) {
        if (socket.readyState !== 1) {
          socketCleanup.get(socket)?.();
          continue;
        }

        if (socketLiveness.get(socket) === false) {
          fastify.log.warn(
            { organizationId },
            "Work order realtime socket terminated after heartbeat timeout",
          );
          socketCleanup.get(socket)?.();
          socket.terminate();
          continue;
        }

        socketLiveness.set(socket, false);

        try {
          socket.ping();
        } catch (error) {
          fastify.log.warn(
            { err: error, organizationId },
            "Failed to ping work order realtime socket",
          );
          socketCleanup.get(socket)?.();
          socket.terminate();
        }
      }
    }
  }, SOCKET_HEARTBEAT_INTERVAL_MS);

  let notificationConnection: NotificationListenerConnection | null = null;
  let listenerReconnectTimer: NodeJS.Timeout | null = null;
  let listenerReconnectAttempt = 0;
  let listenerConnecting = false;
  let isClosing = false;

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

  const detachNotificationConnection = (connection: NotificationListenerConnection) => {
    connection.client.off("notification", notificationHandler);
    connection.client.off("error", connection.onError);
    connection.client.off("end", connection.onEnd);
  };

  const scheduleListenerReconnect = () => {
    if (isClosing || listenerReconnectTimer) {
      return;
    }

    const delayMs = Math.min(
      LISTENER_RECONNECT_MAX_DELAY_MS,
      1_000 * 2 ** listenerReconnectAttempt,
    );
    listenerReconnectAttempt = Math.min(5, listenerReconnectAttempt + 1);

    fastify.log.warn(
      { delayMs, attempt: listenerReconnectAttempt },
      "Work order realtime listener reconnect scheduled",
    );

    listenerReconnectTimer = setTimeout(() => {
      listenerReconnectTimer = null;
      void connectNotificationListener();
    }, delayMs);
  };

  const handleNotificationConnectionFailure = (
    connection: NotificationListenerConnection,
    error: Error,
  ) => {
    if (notificationConnection !== connection) {
      return;
    }

    notificationConnection = null;
    detachNotificationConnection(connection);
    connection.client.release(error);

    fastify.log.error({ err: error }, "Work order realtime listener disconnected");
    scheduleListenerReconnect();
  };

  async function connectNotificationListener() {
    if (isClosing || listenerConnecting || notificationConnection) {
      return;
    }

    listenerConnecting = true;
    let connection: NotificationListenerConnection | null = null;

    try {
      const client = await fastify.pg.connect();

      if (isClosing) {
        client.release(true);
        return;
      }

      connection = {
        client,
        onError: (error) => handleNotificationConnectionFailure(connection!, error),
        onEnd: () =>
          handleNotificationConnectionFailure(
            connection!,
            new Error("PostgreSQL notification connection ended"),
          ),
      };
      notificationConnection = connection;

      client.on("notification", notificationHandler);
      client.once("error", connection.onError);
      client.once("end", connection.onEnd);
      await client.query("LISTEN work_order_events");

      listenerReconnectAttempt = 0;
      fastify.log.info("Work order realtime listener connected");
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error("Failed to connect PostgreSQL listener");

      if (connection && notificationConnection === connection) {
        handleNotificationConnectionFailure(connection, normalizedError);
      } else {
        fastify.log.error(
          { err: normalizedError },
          "Work order realtime listener failed to connect",
        );
        scheduleListenerReconnect();
      }
    } finally {
      listenerConnecting = false;
    }
  }

  await connectNotificationListener();

  fastify.addHook("onClose", async () => {
    isClosing = true;
    clearInterval(heartbeatTimer);

    if (listenerReconnectTimer) {
      clearTimeout(listenerReconnectTimer);
      listenerReconnectTimer = null;
    }

    for (const sockets of socketsByOrganization.values()) {
      for (const socket of [...sockets]) {
        socketCleanup.get(socket)?.();
        socket.close(1001, "Server shutting down");
      }
    }

    socketsByOrganization.clear();

    const connection = notificationConnection;
    notificationConnection = null;

    if (connection) {
      detachNotificationConnection(connection);

      try {
        await connection.client.query("UNLISTEN work_order_events");
        connection.client.release();
      } catch (error) {
        fastify.log.warn({ err: error }, "Failed to close work order realtime listener cleanly");
        connection.client.release(true);
      }
    }
  });

  fastify.log.info("Work order realtime initialized");
};

export default fp(workOrderRealtimePlugin, {
  name: "work-order-realtime",
  dependencies: ["db", "auth"],
});
