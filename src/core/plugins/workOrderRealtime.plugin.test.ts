import { EventEmitter } from "node:events";

import type { WebSocket } from "@fastify/websocket";
import Fastify from "fastify";
import fp from "fastify-plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

import workOrderRealtimePlugin from "./workOrderRealtime.plugin";

class FakePgClient extends EventEmitter {
  query = vi.fn().mockResolvedValue({});
  release = vi.fn();
}

class FakeSocket extends EventEmitter {
  readyState = 1;
  ping = vi.fn();
  send = vi.fn();
  close = vi.fn();
  terminate = vi.fn(() => {
    this.readyState = 3;
  });
}

const servers: Array<ReturnType<typeof Fastify>> = [];

async function createServer(clients: FakePgClient[]) {
  const server = Fastify({ logger: false });
  const connect = vi.fn();

  for (const client of clients) {
    connect.mockResolvedValueOnce(client);
  }

  servers.push(server);
  await server.register(
    fp(
      async (instance) => {
        instance.decorate("db", {
          query: {
            workOrdersDB: {
              findFirst: vi.fn(),
            },
          },
        } as unknown as typeof instance.db);
        instance.decorate("pg", {
          connect,
        } as unknown as typeof instance.pg);
      },
      { name: "db" },
    ),
  );
  await server.register(
    fp(
      async (instance) => {
        instance.decorate("auth", {} as typeof instance.auth);
      },
      { name: "auth" },
    ),
  );
  await server.register(workOrderRealtimePlugin);
  await server.ready();

  return { server, connect };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  vi.useRealTimers();
});

describe("work order realtime plugin", () => {
  it("terminates sockets that stop answering heartbeat pings", async () => {
    vi.useFakeTimers();
    const { server } = await createServer([new FakePgClient()]);
    const socket = new FakeSocket();

    server.workOrderRealtime.registerConnection({
      organizationId: "org-1",
      socket: socket as unknown as WebSocket,
    });

    await vi.advanceTimersByTimeAsync(25_000);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    expect(socket.terminate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(25_000);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
  });

  it("keeps sockets that answer heartbeat pings", async () => {
    vi.useFakeTimers();
    const { server } = await createServer([new FakePgClient()]);
    const socket = new FakeSocket();

    server.workOrderRealtime.registerConnection({
      organizationId: "org-1",
      socket: socket as unknown as WebSocket,
    });

    await vi.advanceTimersByTimeAsync(25_000);
    socket.emit("pong");
    await vi.advanceTimersByTimeAsync(25_000);

    expect(socket.ping).toHaveBeenCalledTimes(2);
    expect(socket.terminate).not.toHaveBeenCalled();
  });

  it("reconnects and listens again when the PostgreSQL listener fails", async () => {
    vi.useFakeTimers();
    const firstClient = new FakePgClient();
    const secondClient = new FakePgClient();
    const { connect } = await createServer([firstClient, secondClient]);
    const connectionError = new Error("connection lost");

    firstClient.emit("error", connectionError);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(firstClient.release).toHaveBeenCalledWith(connectionError);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(secondClient.query).toHaveBeenCalledWith("LISTEN work_order_events");
  });
});
