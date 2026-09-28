// Prefix a root-relative path with the folder the app is served from.
// Vite's BASE_URL is "/" by default and "/mindful-money/" when the build sets
// VITE_BASE_PATH, so hard-coded paths keep working on a shared hostname.
export function withBase(path) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${String(path).replace(/^\//, "")}`;
}
