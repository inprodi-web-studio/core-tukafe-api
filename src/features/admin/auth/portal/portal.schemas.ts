import { z } from "zod";

export const portalLoginBodySchema = z
  .object({
    email: z.email(),
    password: z.string().nonempty(),
  })
  .strict();

export const setPortalActiveOrganizationBodySchema = z
  .object({
    organizationId: z.string().trim().min(1),
  })
  .strict();

const portalUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string().nullable(),
});

const portalOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: z.enum(["owner", "admin"]),
});

export const portalSessionSchema = z.object({
  user: portalUserSchema,
  activeOrganization: portalOrganizationSchema,
  organizations: z.array(portalOrganizationSchema),
});

export type PortalLoginBody = z.infer<typeof portalLoginBodySchema>;
export type SetPortalActiveOrganizationBody = z.infer<typeof setPortalActiveOrganizationBodySchema>;
