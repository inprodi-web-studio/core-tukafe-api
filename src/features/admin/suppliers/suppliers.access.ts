import { userDB } from "@core/db/schemas";
import { forbidden } from "@core/utils";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

export async function requireGlobalSupplierManager(request: FastifyRequest) {
  const [user] = await request.server.db
    .select({ role: userDB.role })
    .from(userDB)
    .where(eq(userDB.id, request.auth.user.id))
    .limit(1);

  if (user?.role !== "owner" && user?.role !== "admin") {
    throw forbidden(
      "supplier.globalManagerRequired",
      "Only a global owner or admin can manage suppliers",
    );
  }
}
