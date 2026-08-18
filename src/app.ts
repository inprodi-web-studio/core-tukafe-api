import { env } from "@core/config/env.config";
import { TRUSTED_ORIGINS } from "@core/constants";
import {
  authPlugin,
  dbPlugin,
  errorHandlerPlugin,
  featureNamespacesPlugin,
  multipartPlugin,
  notificationsPlugin,
  workOrderRealtimePlugin,
  zodSchemaPlugin,
} from "@core/plugins";
import cors from "@fastify/cors";
import { adminApiKeysRoutes, adminApiKeysServicesPlugin } from "@features/admin/apiKeys";
import { adminAuthRoutes, adminAuthServicesPlugin } from "@features/admin/auth";
import { adminCashbackRoutes, adminCashbackServicesPlugin } from "@features/admin/cashback";
import { adminCouponsRoutes, adminCouponsServicesPlugin } from "@features/admin/coupons";
import { adminCustomersRoutes, adminCustomersServicesPlugin } from "@features/admin/customers";
import { adminDashboardRoutes, adminDashboardServicesPlugin } from "@features/admin/dashboard";
import {
  adminIngredientCategoriesRoutes,
  adminIngredientCategoriesServicesPlugin,
} from "@features/admin/ingredientCategories";
import {
  adminIngredientsRoutes,
  adminIngredientsServicesPlugin,
} from "@features/admin/ingredients";
import { adminInventoryRoutes, adminInventoryServicesPlugin } from "@features/admin/inventory";
import { adminModifiersRoutes, adminModifiersServicesPlugin } from "@features/admin/modifiers";
import { adminNotificationsRoutes } from "@features/admin/notifications";
import { adminOrdersRoutes, adminOrdersServicesPlugin } from "@features/admin/orders";
import {
  adminOrganizationsRoutes,
  adminOrganizationsServicesPlugin,
} from "@features/admin/organizations";
import {
  adminProductcategoriesRoutes,
  adminProductcategoriesServicesPlugin,
} from "@features/admin/productCategories";
import { adminProductsRoutes, adminProductsServicesPlugin } from "@features/admin/products";
import { adminSuppliersRoutes, adminSuppliersServicesPlugin } from "@features/admin/suppliers";
import { adminSuppliesRoutes, adminSuppliesServicesPlugin } from "@features/admin/supplies";
import { adminTeamRoutes, adminTeamServicesPlugin } from "@features/admin/team";
import {
  adminSupplyCategoriesRoutes,
  adminSupplyCategoriesServicesPlugin,
} from "@features/admin/supplyCategories";
import { adminTaxesRoutes, adminTaxesServicesPlugin } from "@features/admin/taxes";
import { adminUnitsRoutes, adminUnitsServicesPlugin } from "@features/admin/units";
import {
  adminVariationGroupsRoutes,
  adminVariationGroupsServicesPlugin,
} from "@features/admin/variationGroups";
import { adminUploadsRoutes, adminUploadsServicesPlugin } from "@features/admin/uploads";
import { adminWorkOrdersRoutes, adminWorkOrdersServicesPlugin } from "@features/admin/workOrders";
import { customerAuthRoutes, customerAuthServicesPlugin } from "@features/customer/auth";
import { customerNotificationsRoutes } from "@features/customer/notifications";
import { customerOrganizationsRoutes } from "@features/customer/organizations";
import { customerOrdersRoutes, customerOrdersServicesPlugin } from "@features/customer/orders";
import { customerProductCategoriesRoutes } from "@features/customer/productCategories";
import { customerProductsRoutes } from "@features/customer/products";
import { customerRewardsRoutes } from "@features/customer/rewards";
import { guestCustomersRoutes, guestCustomersServicesPlugin } from "@features/guest/customers";
import {
  guestOrganizationsRoutes,
  guestOrganizationsServicesPlugin,
} from "@features/guest/organizations";
import { guestOrdersRoutes, guestOrdersServicesPlugin } from "@features/guest/orders";
import {
  guestProductCategoriesRoutes,
  guestProductCategoriesServicesPlugin,
} from "@features/guest/productCategories";
import { guestProductsRoutes, guestProductsServicesPlugin } from "@features/guest/products";
import { stripeWebhookRoutes } from "@features/stripe";
import Fastify from "fastify";
import qs from "qs";

const server = Fastify({
  logger: {
    level: "debug",
    transport:
      env.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          }
        : undefined,
  },
  routerOptions: {
    querystringParser: (str) =>
      qs.parse(str, {
        allowDots: false,
        arrayLimit: 1000,
        depth: 10,
        parseArrays: true,
      }),
  },
});

await server.register(cors, {
  origin: TRUSTED_ORIGINS,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-API-Key"],
  credentials: true,
  maxAge: 86400,
});

// --- Plugins
await server.register(dbPlugin);
await server.register(zodSchemaPlugin);
await server.register(multipartPlugin);
await server.register(errorHandlerPlugin);
await server.register(authPlugin);
await server.register(featureNamespacesPlugin);
await server.register(workOrderRealtimePlugin);
await server.register(notificationsPlugin);

server.get("/health", async () => ({
  status: "ok",
}));

await server.register(adminAuthServicesPlugin);
await server.register(adminApiKeysServicesPlugin);
await server.register(adminProductcategoriesServicesPlugin);
await server.register(adminIngredientCategoriesServicesPlugin);
await server.register(adminSupplyCategoriesServicesPlugin);
await server.register(adminVariationGroupsServicesPlugin);
await server.register(adminModifiersServicesPlugin);
await server.register(adminTaxesServicesPlugin);
await server.register(adminUnitsServicesPlugin);
await server.register(adminProductsServicesPlugin);
await server.register(adminCashbackServicesPlugin);
await server.register(adminCouponsServicesPlugin);
await server.register(adminCustomersServicesPlugin);
await server.register(adminDashboardServicesPlugin);
await server.register(adminUploadsServicesPlugin);
await server.register(adminOrdersServicesPlugin);
await server.register(adminOrganizationsServicesPlugin);
await server.register(adminWorkOrdersServicesPlugin);
await server.register(adminIngredientsServicesPlugin);
await server.register(adminInventoryServicesPlugin);
await server.register(adminSuppliesServicesPlugin);
await server.register(adminSuppliersServicesPlugin);
await server.register(adminTeamServicesPlugin);

await server.register(customerAuthServicesPlugin);
await server.register(customerOrdersServicesPlugin);

await server.register(guestCustomersServicesPlugin);
await server.register(guestOrganizationsServicesPlugin);
await server.register(guestOrdersServicesPlugin);
await server.register(guestProductCategoriesServicesPlugin);
await server.register(guestProductsServicesPlugin);

// --- Routes
await server.register(stripeWebhookRoutes, { prefix: "/api/stripe" });

await server.register(
  async (app) => {
    await app.register(
      async (adminApp) => {
        await adminApp.register(adminAuthRoutes, { prefix: "/auth" });
        await adminApp.register(adminApiKeysRoutes, { prefix: "/api-keys" });
        await adminApp.register(adminTaxesRoutes, { prefix: "/taxes" });
        await adminApp.register(adminUnitsRoutes, { prefix: "/units" });
        await adminApp.register(adminProductsRoutes, { prefix: "/products" });
        await adminApp.register(adminCashbackRoutes, { prefix: "/cashback" });
        await adminApp.register(adminCouponsRoutes, { prefix: "/coupons" });
        await adminApp.register(adminCustomersRoutes, { prefix: "/customers" });
        await adminApp.register(adminDashboardRoutes, { prefix: "/dashboard" });
        await adminApp.register(adminUploadsRoutes, { prefix: "/uploads" });
        await adminApp.register(adminOrdersRoutes, { prefix: "/orders" });
        await adminApp.register(adminOrganizationsRoutes, { prefix: "/organizations" });
        await adminApp.register(adminTeamRoutes, { prefix: "/team" });
        await adminApp.register(adminWorkOrdersRoutes, { prefix: "/work-orders" });
        await adminApp.register(adminNotificationsRoutes, { prefix: "/notifications" });
        await adminApp.register(adminProductcategoriesRoutes, { prefix: "/products/categories" });
        await adminApp.register(adminVariationGroupsRoutes, {
          prefix: "/variations/groups",
        });
        await adminApp.register(adminModifiersRoutes, { prefix: "/modifiers" });
        await adminApp.register(adminIngredientsRoutes, { prefix: "/ingredients" });
        await adminApp.register(adminInventoryRoutes, { prefix: "/inventory" });
        await adminApp.register(adminSuppliesRoutes, { prefix: "/supplies" });
        await adminApp.register(adminSuppliersRoutes, { prefix: "/suppliers" });
        await adminApp.register(adminIngredientCategoriesRoutes, {
          prefix: "/ingredients/categories",
        });
        await adminApp.register(adminSupplyCategoriesRoutes, {
          prefix: "/supplies/categories",
        });
      },
      { prefix: "/admin" },
    );

    await app.register(
      async (customerApp) => {
        await customerApp.register(customerAuthRoutes, { prefix: "/auth" });
        await customerApp.register(customerOrganizationsRoutes, { prefix: "/organizations" });
        await customerApp.register(customerOrdersRoutes, { prefix: "/orders" });
        await customerApp.register(customerNotificationsRoutes, { prefix: "/notifications" });
        await customerApp.register(customerProductCategoriesRoutes, {
          prefix: "/product-categories",
        });
        await customerApp.register(customerProductsRoutes, { prefix: "/products" });
        await customerApp.register(customerRewardsRoutes, { prefix: "/rewards" });
      },
      { prefix: "/customer" },
    );

    await app.register(
      async (guestApp) => {
        await guestApp.register(guestCustomersRoutes, { prefix: "/customers" });
        await guestApp.register(guestOrganizationsRoutes, { prefix: "/organizations" });
        await guestApp.register(guestOrdersRoutes, { prefix: "/orders" });
        await guestApp.register(guestProductCategoriesRoutes, { prefix: "/product-categories" });
        await guestApp.register(guestProductsRoutes, { prefix: "/products" });
      },
      { prefix: "/guest" },
    );
  },
  { prefix: "/api" },
);

const start = async () => {
  try {
    await server.listen({ port: env.PORT, host: env.HOST });

    server.log.info(`Server listening on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);

    process.exit(1);
  }
};

start();
