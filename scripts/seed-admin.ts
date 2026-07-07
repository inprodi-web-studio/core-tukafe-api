import { auth } from "@core/config/auth.config";
import { pool } from "@core/db";
import { generateNanoId } from "@core/utils";

const SEED_LOCK_KEY = 720250001;

const ADMIN = {
  email: "amurillo@inprodi.com.mx",
  password: "Asdf123456",
  name: "Andrés",
  middleName: "Murillo",
};

const ORGANIZATIONS = [
  {
    name: "Landmark",
    slug: "landmark",
    address: "P.º de los Virreyes 45, IS01, 45116 Zapopan, Jal.",
  },
  {
    name: "Metropark",
    slug: "metropark",
    address: "Av. Ecónomos 6916, Rinconada del Parque, 45010 Zapopan, Jal.",
  },
  {
    name: "Centro Joyero",
    slug: "centro-joyero",
    address: "P.º Hospicio 35A, Centro, 44360 Guadalajara, Jal.",
  },
] as const;

type SeedStatus = "created" | "existing";

async function seed() {
  const client = await pool.connect();

  try {
    await client.query("select pg_advisory_lock($1);", [SEED_LOCK_KEY]);

    // ── 1. Admin user ──────────────────────────────────────────────
    let adminStatus: SeedStatus = "existing";

    const existingAdmin = await client.query<{ id: string }>(
      'select id from "user" where email = $1 limit 1;',
      [ADMIN.email],
    );

    if (!existingAdmin.rows[0]) {
      await auth.api.signUpEmail({
        body: {
          email: ADMIN.email,
          password: ADMIN.password,
          name: ADMIN.name,
          middleName: ADMIN.middleName,
        },
      });
      adminStatus = "created";
    }

    const adminRow = await client.query<{ id: string }>(
      'select id from "user" where email = $1 limit 1;',
      [ADMIN.email],
    );
    const adminId = adminRow.rows[0]?.id;

    if (!adminId) {
      throw new Error("No se pudo crear o recuperar el usuario admin.");
    }

    await client.query(
      'update "user" set role = $1, email_verified = $2, updated_at = now() where id = $3;',
      ["owner", true, adminId],
    );

    console.log(
      `[seed] Admin ${adminStatus === "created" ? "creado" : "ya existente"}: ${ADMIN.email}`,
    );

    // ── 2. Organizations + admin owner membership ──────────────────
    for (const organization of ORGANIZATIONS) {
      let orgStatus: SeedStatus = "existing";

      const existingOrg = await client.query<{ id: string }>(
        'select id from "organization" where slug = $1 limit 1;',
        [organization.slug],
      );

      let orgId = existingOrg.rows[0]?.id;

      if (!orgId) {
        const orgInsert = await client.query<{ id: string }>(
          `insert into "organization" (id, name, slug, address, created_at, updated_at)
           values ($1, $2, $3, $4, now(), now())
           returning id;`,
          [generateNanoId(), organization.name, organization.slug, organization.address],
        );

        orgId = orgInsert.rows[0]?.id;
        orgStatus = "created";
      } else {
        await client.query(
          `update "organization"
           set name = $1, address = $2, updated_at = now(), deleted_at = null
           where id = $3;`,
          [organization.name, organization.address, orgId],
        );
      }

      if (!orgId) {
        throw new Error(`No se pudo crear o recuperar la organización ${organization.name}.`);
      }

      const existingMembership = await client.query<{ id: string }>(
        'select id from "member" where organization_id = $1 and user_id = $2 limit 1;',
        [orgId, adminId],
      );

      const membershipId = existingMembership.rows[0]?.id;

      if (membershipId) {
        await client.query('update "member" set role = $1, updated_at = now() where id = $2;', [
          "owner",
          membershipId,
        ]);
      } else {
        await client.query(
          `insert into "member" (id, user_id, organization_id, role, created_at, updated_at)
           values ($1, $2, $3, 'owner', now(), now());`,
          [generateNanoId(), adminId, orgId],
        );
      }

      console.log(
        `[seed] Organización ${orgStatus === "created" ? "creada" : "actualizada"}: ${organization.name}`,
      );
      console.log(`[seed] Admin owner en: ${organization.name}`);
    }

    console.log("[seed] Seed completado exitosamente.");
  } finally {
    await client.query("select pg_advisory_unlock($1);", [SEED_LOCK_KEY]);
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error("[seed] Error:", error);
  process.exit(1);
});
