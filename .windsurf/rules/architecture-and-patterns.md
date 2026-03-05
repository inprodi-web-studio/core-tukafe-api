---
trigger: always_on
---

# Architecture Rules for AI (TuKafe API)

This document defines mandatory rules for any AI that creates or modifies code in this project.
The main reference is `src/features/admin/products`, and the pattern should be validated against the rest of the `admin` and `customer` features.

## 1) Objective

Build features with a consistent, typed, secure, and maintainable architecture, following the repository pattern exactly.

## 2) Base project structure

- The backend is organized into `src/core` and `src/features`.
- `src/core` centralizes cross-cutting infrastructure (db, plugins, handlers, types, utils, config).
- `src/features` organizes the domain by area (`admin`, `customer`) and then by feature.
- Each feature exposes:
  - `<feature>.service.ts`
  - `<feature>.routes.ts`
  - `<feature>.plugin.ts`
  - `<feature>.types.ts`
  - `index.ts`
- Specific HTTP actions live in subfolders (`create`, `list`, `createVariation`, etc.) with:
  - `<action>.schemas.ts`
  - `<action>.controllers.ts`
  - `<action>.routes.ts`
  - `index.ts`

## 3) Layering rule (mandatory)

- `routes`: defines endpoint, auth, permissions, request/response schemas, and status codes.
- `controllers`: minimal HTTP orchestration only (read request, call service, respond).
- `service`: business logic, transactions, queries, domain validations, integrations between features.
- `helpers`: normalization and pure helper functions.
- `validators`: complex business rules and cross-validations against the DB.
- `mappers`: response transformation/sorting for a stable contract.
- `schemas` (zod): API input/output contract.
- `types`: TS contracts for the feature (service interface, DTOs, responses).

Strict rule:

- Do not put business logic in controllers.
- Do not put HTTP access (reply/status) in the service.
- Do not duplicate business validations if they already exist in validators/helpers.

## 4) Naming and organization conventions

- Use absolute aliases `@core/*` and `@features/*`.
- Use `import type` for types.
- Naming conventions:
  - `admin<Feature>Service` for the service factory.
  - `admin<Feature>Routes` for the routes aggregator.
  - `admin<Feature>ServicesPlugin` for the namespace plugin.
- Service interfaces:
  - `Admin<Feature>Service` or `Customer<Feature>Service`.
- DTOs:
  - `CreateXServiceParams`, `XResponse`, `ListXServiceParams`, etc.

## 5) Feature namespaces (Fastify)

- Every feature MUST be registered in `fastify.admin` or `fastify.customer` via plugin.
- The plugin MUST:
  - Perform module augmentation in `@core/types/feature-namespaces`.
  - Declare dependency `dependencies: ["feature-namespaces"]`.
  - Decorate only public service methods (do not expose internal helpers).

## 6) Routes pattern

- Define routes per action and register them in `<feature>.routes.ts` with `server.register(...)`.
- In admin, use `adminAuthHandler` with explicit permissions per endpoint.
- The permission MUST map to the correct resource in `src/core/config/permissions.config.ts`.
- Define zod schema for `body`, `params`, `querystring`, and `response`.
- Status code:
  - `201` for creation.
  - `200` for reads/lists.

## 7) Validation pattern (two-layer)

- Layer 1: structural validation in zod (types, required, formats, basic constraints).
- Layer 2: domain validation in service/validators (existence, cross rules, business consistency).

Reference example (`products`):

- Zod validates the shape of `recipe`, `variations`, `productType`.
- Validators validate rules such as:
  - unique variation combinations,
  - allowed precision by unit,
  - consistency between `productType`, `recipe`, base price, and variations.

## 8) Persistence and DB pattern

- Use Drizzle with `*DB` tables from `@core/db/schemas`.
- New IDs: use `generateNanoId()`.
- For multi-table operations, use `fastify.db.transaction(...)`.
- In entities with soft delete, filter by `deletedAt IS NULL` when applicable.
- Keep deterministic ordering (e.g., `asc(name), asc(id)`).
- For lists:
  - use `paginate(...)`,
  - use `buildFuzzySearch(...)` when there is `search`,
  - return a consistent paginated contract.

## 9) Error handling (mandatory)

- Throw domain errors with helpers from `@core/utils`:
  - `notFound`, `validation`, `conflict`, `badRequest`, `unauthorized`, `forbidden`.
- Never expose raw DB errors to the client.
- Map Postgres errors by `code` and `constraint` with `getPgError(...)`.
- For unique violations (`23505`), translate to `conflict(...)` with a stable semantic code.

## 10) Normalization and mapping pattern

- Normalize input in `helpers` before persisting:
  - strings (`normalizeString`),
  - amounts (`toBase100Integer`),
  - array deduplication (`Set` or `assertUniqueValues`).
- Return responses from mappers to:
  - hide internal columns,
  - flatten relations (e.g., `taxes: [{ tax }] -> taxes: Tax[]`),
  - sort collections in a stable way.
- For complex create/update, fetch the final entity with `get(...)` and respond with that canonical contract.

## 11) Specific pattern for actions

- Each action must have its 4 files (`schemas`, `controllers`, `routes`, `index`).
- `controllers` must be small and straightforward.
- If multiple actions share schemas, move them to the feature root (e.g., `product.schemas.ts`, `modifiers.schemas.ts`).

## 12) Registration in app.ts (if a new feature is added)

- Import `...ServicesPlugin` and `...Routes`.
- Register the service plugin before routes.
- Register routes within the correct tree (`/api/admin` or `/api/customer`) with their `prefix`.

## 13) Mandatory checklist for AI before finishing

- Was layer separation respected (`routes/controllers/service/helpers/validators/mappers`)?
- Is the service fully typed in `<feature>.types.ts`?
- Do all routes have auth/permissions/schema/response?
- Are business validations in service/validators and not in the controller?
- Are transactions used for multi-table writes?
- Are DB errors mapped to domain errors?
- Is a stable, ordered response contract returned?
- If a new resource was added, were `permissions.config.ts` and `app.ts` updated?

## 14) Forbidden anti-patterns

- Business logic inside controllers.
- Direct DB access from routes.
- Responses without a declared zod schema.
- Using `any` to avoid contract typing.
- Duplicating normalization logic across multiple files.
- Returning DB entities unmapped when the contract requires an enriched shape.
- Ignoring soft delete when querying active entities.

## 15) Final implementation rule

If there is any doubt about structure, use the following as direct templates:

- `src/features/admin/products` for complex cases with validators/mappers/transactions.
- `src/features/admin/supplies` for simple CRUD with list/create.
- `scripts/scaffold` to generate skeletons and then complete the domain logic.
