import { describe, expect, it } from "vitest";
import { buildPortalSession, filterPortalOrganizations } from "./auth.service";
import type { PortalOrganization } from "./auth.types";

const user = {
  id: "user-1",
  email: "admin@tukafe.test",
  name: "Admin",
  middleName: null,
  lastName: null,
  role: "owner",
};

const organizations: PortalOrganization[] = [
  { id: "owner-org", name: "Owner", slug: "owner", role: "owner" },
  { id: "admin-org", name: "Admin", slug: "admin", role: "admin" },
];

describe("portal auth rules", () => {
  it("permite únicamente membresías owner y admin", () => {
    const result = filterPortalOrganizations([
      ...organizations,
      { id: "member-org", name: "Member", slug: "member", role: "member" },
      { id: "barista-org", name: "Barista", slug: "barista", role: "barista" },
    ]);

    expect(result.map((organization) => organization.role)).toEqual(["owner", "admin"]);
  });

  it("conserva una organización administrativa activa", () => {
    const session = buildPortalSession(user, organizations, "admin-org");

    expect(session.activeOrganization).toEqual(organizations[1]);
    expect(session.organizations).toHaveLength(2);
  });

  it("rechaza una organización activa fuera del portal", () => {
    expect(() => buildPortalSession(user, organizations, "barista-org")).toThrowError(
      expect.objectContaining({ code: "auth.portalAccessDenied", statusCode: 403 }),
    );
  });
});
