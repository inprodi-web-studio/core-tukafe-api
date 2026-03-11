import { normalizeString, normalizePresets } from "@core/utils";
import type { CreateSupplierServiceParams } from "./suppliers.types";

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
