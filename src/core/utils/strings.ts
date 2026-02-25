export interface NormalizeStringOptions {
  /**
   * Convert to lowercase
   * @default false
   */
  lowercase?: boolean;

  /**
   * Convert to uppercase
   * @default false
   */
  uppercase?: boolean;

  /**
   * Capitalize first letter of each word
   * @default false
   */
  capitalize?: boolean;

  /**
   * Capitalize only the first letter of the string
   * @default false
   */
  capitalizeFirst?: boolean;

  /**
   * Trim whitespace from start and end
   * @default true
   */
  trim?: boolean;

  /**
   * Remove extra whitespace (multiple spaces become single space)
   * @default false
   */
  collapseWhitespace?: boolean;

  /**
   * Remove all whitespace
   * @default false
   */
  removeWhitespace?: boolean;

  /**
   * Remove accents/diacritics (e.g., "José" -> "Jose")
   * @default false
   */
  removeAccents?: boolean;

  /**
   * Remove special characters (keeps only letters, numbers, spaces)
   * @default false
   */
  removeSpecialChars?: boolean;

  /**
   * Custom characters to keep when removeSpecialChars is true
   * @example ['-', '_', '.']
   */
  keepChars?: string[];

  /**
   * Replace specific characters or patterns
   * @example [{ from: ' ', to: '-' }]
   */
  replace?: Array<{ from: string | RegExp; to: string }>;

  /**
   * Maximum length (truncates if longer)
   */
  maxLength?: number;
}

/**
 * Normalizes a string based on provided options
 * @param value - The string to normalize
 * @param options - Configuration options
 * @returns Normalized string
 */
export function normalizeString(
  value: string | null | undefined,
  options: NormalizeStringOptions = {},
): string {
  if (value === null || value === undefined) {
    return "";
  }

  let result = String(value);

  // Trim whitespace (default: true)
  if (options.trim !== false) {
    result = result.trim();
  }

  // Remove accents
  if (options.removeAccents) {
    result = result.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // Remove special characters
  if (options.removeSpecialChars) {
    const keepChars = options.keepChars || [];
    const escapedKeepChars = keepChars.map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`[^a-zA-Z0-9\\s${escapedKeepChars.join("")}]`, "g");
    result = result.replace(pattern, "");
  }

  // Collapse whitespace
  if (options.collapseWhitespace) {
    result = result.replace(/\s+/g, " ");
  }

  // Remove all whitespace
  if (options.removeWhitespace) {
    result = result.replace(/\s/g, "");
  }

  // Case transformations
  if (options.lowercase) {
    result = result.toLowerCase();
  } else if (options.uppercase) {
    result = result.toUpperCase();
  } else if (options.capitalize) {
    result = result
      .toLowerCase()
      .split(" ")
      .map((word) => (word.length > 0 && word[0] ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" ");
  } else if (options.capitalizeFirst) {
    result =
      result.length > 0 && result[0]
        ? result[0].toUpperCase() + result.slice(1).toLowerCase()
        : result;
  }

  // Custom replacements
  if (options.replace && options.replace.length > 0) {
    for (const replacement of options.replace) {
      result = result.replace(
        typeof replacement.from === "string" ? new RegExp(replacement.from, "g") : replacement.from,
        replacement.to,
      );
    }
  }

  // Max length
  if (options.maxLength && result.length > options.maxLength) {
    result = result.slice(0, options.maxLength);
  }

  return result;
}

/**
 * Preset configurations for common use cases
 */
export const normalizePresets = {
  /**
   * Normalize email addresses
   * - Lowercase
   * - Trim whitespace
   * - Remove extra spaces
   */
  email: {
    lowercase: true,
    trim: true,
    collapseWhitespace: true,
    removeWhitespace: true,
  } as NormalizeStringOptions,

  /**
   * Normalize person names
   * - Capitalize each word
   * - Trim whitespace
   * - Collapse multiple spaces
   */
  personName: {
    capitalize: true,
    trim: true,
    collapseWhitespace: true,
  } as NormalizeStringOptions,

  /**
   * Normalize slugs (URL-friendly strings)
   * - Lowercase
   * - Remove accents
   * - Replace spaces with hyphens
   * - Remove special characters except hyphens
   */
  slug: {
    lowercase: true,
    removeAccents: true,
    trim: true,
    collapseWhitespace: true,
    removeSpecialChars: true,
    keepChars: ["-"],
    replace: [{ from: " ", to: "-" }],
  } as NormalizeStringOptions,

  /**
   * Normalize phone numbers
   * - Remove all non-numeric characters
   */
  phone: {
    removeSpecialChars: true,
    removeWhitespace: true,
    keepChars: ["+"],
  } as NormalizeStringOptions,

  /**
   * Normalize usernames
   * - Lowercase
   * - Remove accents
   * - Remove special characters except underscore and hyphen
   * - Trim whitespace
   */
  username: {
    lowercase: true,
    removeAccents: true,
    removeSpecialChars: true,
    keepChars: ["_", "-"],
    trim: true,
    collapseWhitespace: true,
    removeWhitespace: true,
  } as NormalizeStringOptions,
};
