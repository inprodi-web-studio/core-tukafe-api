import { userDB } from "@core/db/schemas";
import { forbidden } from "@core/utils";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

export async function requireGlobalInventoryOwner(request: FastifyRequest) {
  const [user] = await request.server.db
    .select({ role: userDB.role })
    .from(userDB)
    .where(eq(userDB.id, request.auth.user.id))
    .limit(1);

  if (user?.role !== "owner") {
    throw forbidden(
      "inventory.globalOwnerRequired",
      "Only a global owner can manage inventory catalogs",
    );
  }
}
