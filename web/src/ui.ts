export const escapeHTML = (v: unknown) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const paths: Record<string, string> = {
  signal:
    '<circle cx="12" cy="11" r="2"/><path d="M12 14v7M7.8 6.8a6 6 0 0 0 0 8.4m8.4-8.4a6 6 0 0 1 0 8.4M4.3 3.3a11 11 0 0 0 0 15.4m15.4-15.4a11 11 0 0 1 0 15.4"/>',
  overview:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  sessions:
    '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16m-12 4h4"/>',
  spectrum: '<path d="M2 12h3l2-6 4 13 3-15 3 10 2-2h3"/>',
  receivers:
    '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 16h.01M11 16h.01M7 8V3m10 5V3m-2 9h3"/>',
  settings:
    '<path d="M4 6h7m5 0h4M4 12h2m5 0h9M4 18h10m5 0h1"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5 5-3Z"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  location:
    '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  walk: '<path d="m7 21 3-7-2-3 2-5 4 4 4 1m-6 3 4 7"/><circle cx="13" cy="3" r="1.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',
  upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 17v4h16v-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
export const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.signal}</svg>`;
export const number = (value: number | undefined, digits = 0) =>
  value === undefined
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
export const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export const duration = (start: string, end?: string) => {
  const n = Math.max(
    0,
    Math.round((Date.parse(end ?? start) - Date.parse(start)) / 1000),
  );
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
export const empty = (title: string, detail: string, buttons = "") =>
  `<div class="empty-state">${icon("signal")}<span class="eyebrow">READY WHEN YOU ARE</span><h2>${title}</h2><p>${detail}</p><div class="actions">${buttons}</div></div>`;
export const button = (
  action: string,
  label: string,
  primary = false,
  svg?: string,
) =>
  `<button data-action="${action}" class="button ${primary ? "primary" : ""}">${svg ? icon(svg) : ""}${label}</button>`;
