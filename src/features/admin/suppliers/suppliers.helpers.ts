import { normalizeString, normalizePresets } from "@core/utils";
import type { CreateSupplierServiceParams, UpdateSupplierServiceParams } from "./suppliers.types";

export const normalizeSupplierInput = ({ name, email, phone }: CreateSupplierServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });
  const normalizedEmail = normalizeString(email, normalizePresets.email);
  const normalizedPhone = normalizeString(phone, normalizePresets.phone);

  return {
    name: normalizedName,
    email: normalizedEmail === "" ? null : normalizedEmail,
    phone: normalizedPhone === "" ? null : normalizedPhone,
  };
};

export const normalizeSupplierUpdateInput = (input: UpdateSupplierServiceParams) => ({
  ...(input.name !== undefined && {
    name: normalizeString(input.name, { trim: true, collapseWhitespace: true }),
  }),
  ...(input.email !== undefined && {
    email: normalizeString(input.email, normalizePresets.email) || null,
  }),
  ...(input.phone !== undefined && {
    phone: normalizeString(input.phone, normalizePresets.phone) || null,
  }),
});
