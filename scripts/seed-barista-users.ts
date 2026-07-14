import { auth } from "@core/config/auth.config";
import { pool } from "@core/db";
import { generateNanoId } from "@core/utils";
import { hashPassword } from "better-auth/crypto";

const SEED_LOCK_KEY = 720250002;
const BARISTA_PASSWORD = "Tukafe2026";

const BARISTA_USERS = [
  {
    email: "metropark@tukafe.mx",
    name: "Barista Metropark",
    middleName: "TuKafe",
    organizationSlug: "metropark",
  },
  {
    email: "cj@tukafe.mx",
    name: "Barista Centro Joyero",
    middleName: "TuKafe",
    organizationSlug: "centro-joyero",
  },
  {
    email: "landmark@tukafe.mx",
    name: "Barista Landmark",
    middleName: "TuKafe",
    organizationSlug: "landmark",
  },
] as const;

type SeedStatus = "created" | "existing";

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("select pg_advisory_lock($1);", [SEED_LOCK_KEY]);

    for (const barista of BARISTA_USERS) {
      let userStatus: SeedStatus = "existing";

      const organizationResult = await client.query<{ id: string; name: string }>(
        'select id, name from "organization" where slug = $1 and deleted_at is null limit 1;',
        [barista.organizationSlug],
      );
      const organization = organizationResult.rows[0];

      if (!organization) {
        throw new Error(
          `No existe la sucursal "${barista.organizationSlug}". Ejecuta primero yarn db:seed.`,
        );
      }

      let userResult = await client.query<{ id: string }>(
        'select id from "user" where email = $1 limit 1;',
        [barista.email],
      );
      let userId = userResult.rows[0]?.id;

      if (!userId) {
        await auth.api.signUpEmail({
          body: {
            email: barista.email,
            password: BARISTA_PASSWORD,
            name: barista.name,
            middleName: barista.middleName,
          },
        });

        userResult = await client.query<{ id: string }>(
          'select id from "user" where email = $1 limit 1;',
          [barista.email],
        );
        userId = userResult.rows[0]?.id;
        userStatus = "created";
      }

      if (!userId) {
        throw new Error(`No se pudo crear o recuperar el usuario ${barista.email}.`);
      }

      const passwordHash = await hashPassword(BARISTA_PASSWORD);

      await client.query(
        `update "user"
         set email_verified = true, banned = false, ban_reason = null,
             ban_expires = null, updated_at = now()
         where id = $1;`,
        [userId],
      );

      // This seed intentionally restores the shared barista credential on every run.
      await client.query(
        `insert into "account"
           (id, user_id, account_id, provider_id, password, created_at, updated_at)
         values ($1, $2, $2, 'credential', $3, now(), now())
         on conflict (provider_id, account_id)
         do update set password = excluded.password, updated_at = now();`,
        [generateNanoId(), userId, passwordHash],
      );

      const membershipResult = await client.query<{ id: string }>(
        'select id from "member" where organization_id = $1 and user_id = $2 limit 1;',
        [organization.id, userId],
      );
      const membershipId = membershipResult.rows[0]?.id;

      if (membershipId) {
        await client.query('update "member" set role = $1, updated_at = now() where id = $2;', [
          "barista",
          membershipId,
        ]);
      } else {
        await client.query(
          `insert into "member" (id, user_id, organization_id, role, created_at, updated_at)
           values ($1, $2, $3, 'barista', now(), now());`,
          [generateNanoId(), userId, organization.id],
        );
      }

      console.log(
        `[seed:baristas] ${userStatus === "created" ? "Creado" : "Actualizado"}: ${barista.email} -> ${organization.name}`,
      );
    }

    console.log("[seed:baristas] Seed completado exitosamente.");
  } finally {
    await client.query("select pg_advisory_unlock($1);", [SEED_LOCK_KEY]);
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error("[seed:baristas] Error:", error);
  process.exit(1);
});
