import { env } from "@core/config/env.config";
import { TRUSTED_ORIGINS } from "@core/constants";
import {
  authPlugin,
  dbPlugin,
  errorHandlerPlugin,
  featureNamespacesPlugin,
  zodSchemaPlugin,
} from "@core/plugins";
import cors from "@fastify/cors";
import { adminAuthRoutes, adminAuthServicesPlugin } from "@features/admin/auth";
import {
  adminIngredientCategoriesRoutes,
  adminIngredientCategoriesServicesPlugin,
} from "@features/admin/ingredientCategories";
import {
  adminIngredientsRoutes,
  adminIngredientsServicesPlugin,
} from "@features/admin/ingredients";
import {
  adminSupplyCategoriesRoutes,
  adminSupplyCategoriesServicesPlugin,
} from "@features/admin/supplyCategories";
import { adminSuppliesRoutes, adminSuppliesServicesPlugin } from "@features/admin/supplies";
import {
  adminProductcategoriesRoutes,
  adminProductcategoriesServicesPlugin,
} from "@features/admin/productCategories";
import { adminProductsRoutes, adminProductsServicesPlugin } from "@features/admin/products";
import { adminTaxesRoutes, adminTaxesServicesPlugin } from "@features/admin/taxes";
import { adminUnitsRoutes, adminUnitsServicesPlugin } from "@features/admin/units";
import { customerAuthRoutes, customerAuthServicesPlugin } from "@features/customer/auth";
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
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
});

// --- Plugins
await server.register(dbPlugin);
await server.register(zodSchemaPlugin);
await server.register(errorHandlerPlugin);
await server.register(authPlugin);
await server.register(featureNamespacesPlugin);

await server.register(adminAuthServicesPlugin);
await server.register(adminProductcategoriesServicesPlugin);
await server.register(adminIngredientCategoriesServicesPlugin);
await server.register(adminSupplyCategoriesServicesPlugin);
await server.register(adminTaxesServicesPlugin);
await server.register(adminUnitsServicesPlugin);
await server.register(adminProductsServicesPlugin);
await server.register(adminIngredientsServicesPlugin);
await server.register(adminSuppliesServicesPlugin);

await server.register(customerAuthServicesPlugin);

// --- Routes
await server.register(
  async (app) => {
    await app.register(
      async (adminApp) => {
        await adminApp.register(adminAuthRoutes, { prefix: "/auth" });
        await adminApp.register(adminTaxesRoutes, { prefix: "/taxes" });
        await adminApp.register(adminUnitsRoutes, { prefix: "/units" });
        await adminApp.register(adminProductsRoutes, { prefix: "/products" });
        await adminApp.register(adminProductcategoriesRoutes, { prefix: "/products/categories" });
        await adminApp.register(adminIngredientsRoutes, { prefix: "/ingredients" });
        await adminApp.register(adminSuppliesRoutes, { prefix: "/supplies" });
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
      },
      { prefix: "/customer" },
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
