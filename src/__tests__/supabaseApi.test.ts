import sql from "../../supabase/migrations/20261006000000_comunidad.sql?raw";
import { CommunityError } from "../community/api";
import { createSupabaseApi } from "../community/supabaseApi";

// Funciones públicas del SQL y sus parámetros.
const signatures = new Map<string, string[]>();
for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)/g)) {
  const params = m[2]
    .split(",")
    .map((p: string) => p.trim().split(/\s+/)[0])
    .filter((p: string) => p && p !== "out");
  signatures.set(m[1], params);
}
const granted = /grant execute on function([\s\S]*?)to authenticated;/.exec(sql)![1];

describe("cliente de Supabase", () => {
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  let reply: unknown = null;
  let status = 200;

  beforeAll(() => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const m = /\/rest\/v1\/rpc\/(\w+)/.exec(url);
      if (m) calls.push({ fn: m[1], body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify(reply), { status, headers: { "Content-Type": "application/json" } });
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it("llama a funciones que existen, con los parámetros del SQL", async () => {
    const api = createSupabaseApi("https://ejemplo.supabase.co", "clave-publica");
    await api.getMyProfile();
    await api.saveProfile({ username: "ana", display_name: "Ana", avatar: "🦊", color: "rose", bio: "", genres: [], favorite_book: "", favorite_authors: "", reading_moment: "", yearly_goal: 12 });
    await api.getProfile("ana", "2026-10-07");
    await api.searchUsers("an");
    await api.sync([], { tz: "UTC", total_xp: 0, level: 1, streak: 0, best_streak: 0, last_active_day: null, books_finished: 0, books_this_year: 0, minutes_total: 0, achievements: [], reading_now: null }, null);
    await api.getLeague();
    await api.getFriends("2026-10-07");
    await api.requestFriend("beto");
    await api.respondFriend("id", true);
    await api.removeFriend("id");
    await api.getFeed({ before: "2026-10-07T00:00:00Z", userId: "id", limit: 5 });
    await api.createPost("share_book", { title: "Rayuela" });
    await api.deletePost("id");
    await api.toggleLike("id");

    expect(calls.length).toBe(14);
    for (const c of calls) {
      expect(signatures.has(c.fn), `existe ${c.fn}`).toBe(true);
      expect(granted, `permiso para ${c.fn}`).toContain(`public.${c.fn}(`);
      expect(Object.keys(c.body).sort(), `parámetros de ${c.fn}`).toEqual(signatures.get(c.fn)!.slice().sort());
    }
  });

  it("muestra los mensajes del servidor y avisa si falta la base de datos", async () => {
    const api = createSupabaseApi("https://ejemplo.supabase.co", "clave-publica");
    status = 400;
    reply = { code: "23505", message: "Ese nombre de usuario ya está ocupado", details: null, hint: null };
    await expect(api.saveProfile({} as never)).rejects.toThrow("Ese nombre de usuario ya está ocupado");
    status = 404;
    reply = { code: "PGRST202", message: "Could not find the function public.get_league without parameters", details: null, hint: null };
    const err = await api.getLeague().catch((e) => e);
    expect(err).toBeInstanceOf(CommunityError);
    expect(err.message).toContain("base de datos");
    status = 200;
    reply = null;
  });
});
