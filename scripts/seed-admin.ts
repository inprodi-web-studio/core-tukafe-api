import { auth } from "@core/config/auth.config";
import { pool } from "@core/db";

const SEED_LOCK_KEY = 720250001;

const ADMIN = {
  email: "amurillo@inprodi.com.mx",
  password: "Asdf123456",
  name: "Andrés",
  middleName: "Murillo",
};

const ORGANIZATION = {
  name: "Sucursal Centro",
  slug: "sucursal-centro",
  address: "Av. Principal #100, Col. Centro",
};

const CUSTOMER = {
  email: "cliente@tukafe.com",
  password: "Asdf123456",
  name: "Carlos",
  middleName: "López",
  phone: "+5214421234567",
};

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

    // ── 2. Organization ────────────────────────────────────────────
    let orgStatus: SeedStatus = "existing";

    const existingOrg = await client.query<{ id: string }>(
      'select id from "organization" where slug = $1 limit 1;',
      [ORGANIZATION.slug],
    );

    let orgId = existingOrg.rows[0]?.id;

    if (!orgId) {
      const orgInsert = await client.query<{ id: string }>(
        `insert into "organization" (id, name, slug, address, created_at, updated_at)
         values (gen_random_uuid()::text, $1, $2, $3, now(), now())
         returning id;`,
        [ORGANIZATION.name, ORGANIZATION.slug, ORGANIZATION.address],
      );

      orgId = orgInsert.rows[0]?.id;
      orgStatus = "created";
    }

    if (!orgId) {
      throw new Error("No se pudo crear o recuperar la organización.");
    }

    console.log(
      `[seed] Organización ${orgStatus === "created" ? "creada" : "ya existente"}: ${ORGANIZATION.name}`,
    );

    // ── 3. Admin as owner member ───────────────────────────────────
    const existingMember = await client.query<{ id: string }>(
      'select id from "member" where user_id = $1 and organization_id = $2 limit 1;',
      [adminId, orgId],
    );

    if (!existingMember.rows[0]) {
      await client.query(
        `insert into "member" (id, user_id, organization_id, role, created_at, updated_at)
         values (gen_random_uuid()::text, $1, $2, 'owner', now(), now());`,
        [adminId, orgId],
      );
      console.log("[seed] Admin asignado como owner de la organización.");
    } else {
      console.log("[seed] Admin ya es miembro de la organización.");
    }

    // ── 4. Customer user ───────────────────────────────────────────
    let customerStatus: SeedStatus = "existing";

    const existingCustomer = await client.query<{ id: string }>(
      'select id from "user" where email = $1 limit 1;',
      [CUSTOMER.email],
    );

    if (!existingCustomer.rows[0]) {
      await auth.api.signUpEmail({
        body: {
          email: CUSTOMER.email,
          password: CUSTOMER.password,
          name: CUSTOMER.name,
          middleName: CUSTOMER.middleName,
        },
      });
      customerStatus = "created";
    }

    const customerRow = await client.query<{ id: string }>(
      'select id from "user" where email = $1 limit 1;',
      [CUSTOMER.email],
    );
    const customerId = customerRow.rows[0]?.id;

    if (!customerId) {
      throw new Error("No se pudo crear o recuperar el usuario cliente.");
    }

    await client.query(
      `update "user" set role = 'customer', phone_number = $1, phone_number_verified = true,
       email_verified = true, updated_at = now() where id = $2;`,
      [CUSTOMER.phone, customerId],
    );

    // ── 5. Customer identity ───────────────────────────────────────
    const existingCustomerByUser = await client.query<{ id: string }>(
      'select id from "customer" where user_id = $1 and deleted_at is null limit 1;',
      [customerId],
    );

    if (existingCustomerByUser.rows[0]) {
      await client.query(
        `update "customer"
         set phone = $1, name = $2, middle_name = $3, email = $4, updated_at = now(), deleted_at = null
         where id = $5;`,
        [CUSTOMER.phone, CUSTOMER.name, CUSTOMER.middleName, CUSTOMER.email, existingCustomerByUser.rows[0].id],
      );
    } else {
      const existingCustomerByPhone = await client.query<{ id: string; user_id: string | null }>(
        'select id, user_id from "customer" where phone = $1 and deleted_at is null limit 1;',
        [CUSTOMER.phone],
      );

      const phoneCustomer = existingCustomerByPhone.rows[0];

      if (phoneCustomer) {
        if (phoneCustomer.user_id && phoneCustomer.user_id !== customerId) {
          throw new Error("El teléfono del cliente ya está ligado a otro usuario.");
        }

        await client.query(
          `update "customer"
           set user_id = $1, name = $2, middle_name = $3, email = $4, updated_at = now(), deleted_at = null
           where id = $5;`,
          [customerId, CUSTOMER.name, CUSTOMER.middleName, CUSTOMER.email, phoneCustomer.id],
        );
      } else {
        await client.query(
          `insert into "customer"
             (id, user_id, phone, name, middle_name, email, created_at, updated_at)
           values (gen_random_uuid()::text, $1, $2, $3, $4, $5, now(), now());`,
          [customerId, CUSTOMER.phone, CUSTOMER.name, CUSTOMER.middleName, CUSTOMER.email],
        );
      }
    }

    console.log(
      `[seed] Cliente ${customerStatus === "created" ? "creado" : "ya existente"}: ${CUSTOMER.email}`,
    );

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
