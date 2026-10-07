// Divisiones de la liga semanal y sus zonas de ascenso y descenso.
// Las reglas coinciden con league_zones() en supabase/migrations.

export interface Division {
  id: number;
  name: string;
  color: string;
  light: string;
}

export const DIVISIONS: Division[] = [
  { id: 0, name: "Bronce", color: "#b0713a", light: "#e6a76d" },
  { id: 1, name: "Plata", color: "#8a96a8", light: "#dfe5ee" },
  { id: 2, name: "Oro", color: "#d99a1e", light: "#ffdc7a" },
  { id: 3, name: "Zafiro", color: "#2f63d8", light: "#8fb4ff" },
  { id: 4, name: "Rubí", color: "#c8234f", light: "#ff8aa8" },
  { id: 5, name: "Esmeralda", color: "#169a5a", light: "#7debb0" },
  { id: 6, name: "Amatista", color: "#7b3fc4", light: "#c9a2ff" },
  { id: 7, name: "Perla", color: "#b49a8c", light: "#fff4ec" },
  { id: 8, name: "Obsidiana", color: "#2b2d3c", light: "#8a8fae" },
  { id: 9, name: "Diamante", color: "#2ab3d6", light: "#c8f6ff" },
];

export const GROUP_SIZE = 30;
const PROMOTE = [10, 10, 10, 7, 7, 7, 5, 5, 5, 0];
const DEMOTE = [0, 5, 5, 5, 5, 5, 5, 5, 5, 5];

export function division(id: number): Division {
  return DIVISIONS[Math.max(0, Math.min(DIVISIONS.length - 1, Math.round(id) || 0))];
}

/** Cuántas personas suben y bajan en un grupo de `size` personas. */
export function leagueZones(div: number, size: number): { promote: number; demote: number } {
  const promote = div >= 9 || size < 1 ? 0 : Math.min(PROMOTE[div], Math.max(1, Math.floor(size / 3)));
  const demote = div <= 0 ? 0 : Math.min(DEMOTE[div], Math.floor(size / 5));
  return { promote, demote };
}

export type Zone = "promote" | "demote" | "stay";

export function zoneOf(rank: number, size: number, div: number, xp: number): Zone {
  const z = leagueZones(div, size);
  if (rank <= z.promote && xp > 0) return "promote";
  if (rank > size - z.demote) return "demote";
  return "stay";
}

/** Lunes 00:00 UTC de la semana de `date` (la liga se reinicia a esa hora). */
export function weekStartUtc(date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export function weekKey(date = new Date()): string {
  return weekStartUtc(date).toISOString().slice(0, 10);
}

/** "2 d 5 h", "5 h 12 min", "8 min". */
export function formatTimeLeft(endsAt: number, now = Date.now()): string {
  const ms = Math.max(0, endsAt - now);
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${Math.max(1, m)} min`;
}

export function zoneText(div: number, size = GROUP_SIZE): string {
  const z = leagueZones(div, size);
  const parts: string[] = [];
  if (z.promote) parts.push(`los ${z.promote} primeros suben a ${division(div + 1).name}`);
  if (z.demote) parts.push(`los ${z.demote} últimos bajan a ${division(div - 1).name}`);
  if (!parts.length) return "Compite por quedar en lo más alto.";
  const text = parts.join(" y ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}
