export const MAX_HOMEPAGE_CHARACTERS = 10;

export function normalizeHomepageCharacterIds(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Choose the characters that should appear on the homepage.");
  const ids = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (!ids.length) throw new Error("Choose at least one character for the homepage.");
  if (ids.length > MAX_HOMEPAGE_CHARACTERS) {
    throw new Error(`Choose no more than ${MAX_HOMEPAGE_CHARACTERS} homepage characters.`);
  }
  if (ids.some((id) => !id || id.length > 100)) throw new Error("One homepage character ID is invalid.");
  if (new Set(ids).size !== ids.length) throw new Error("Each homepage character can only be selected once.");
  return ids;
}
