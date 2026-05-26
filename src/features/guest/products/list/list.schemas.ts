import { z } from "zod";

const imageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  mimeType: z.string(),
});

const unitSchema = z.object({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string(),
  precision: z.number().int().nonnegative(),
});

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  isFourPlusOneEligible: z.boolean(),
  parentId: z.string().nullable(),
  image: imageSchema.nullable(),
});

const taxSchema = z.object({
  id: z.string(),
  name: z.string(),
  rate: z.number().int().nonnegative(),
});

const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  address: z.string(),
  logo: z.string().nullable(),
});

const variationGroupOptionSchema = z.object({
  id: z.string(),
  variationGroupId: z.string(),
  name: z.string(),
  customerDescription: z.string().nullable(),
  image: imageSchema.nullable(),
  sortOrder: z.number().int().nonnegative(),
});

const variationGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  customerLabel: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  options: z.array(variationGroupOptionSchema),
});

const variationSchema = z.object({
  id: z.string(),
  sortOrder: z.number().int().nonnegative(),
  priceCents: z.number().int().nonnegative(),
  customerDescription: z.string().nullable(),
  selections: z.array(
    z.object({
      group: z.object({
        id: z.string(),
        name: z.string(),
        customerLabel: z.string().nullable(),
        sortOrder: z.number().int().nonnegative(),
      }),
      option: variationGroupOptionSchema,
    }),
  ),
});

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative().nullable(),
  customerDescription: z.string().nullable(),
  productType: z.enum(["simple", "assembled", "compound"]),
  image: imageSchema.nullable(),
  unit: unitSchema,
  category: categorySchema.nullable(),
  organizations: z.array(organizationSchema),
  taxes: z.array(taxSchema),
  variationGroups: z.array(variationGroupSchema),
  variations: z.array(variationSchema),
});

export const listResponseSchema = z.array(productSchema);

export type ListResponse = z.infer<typeof listResponseSchema>;
