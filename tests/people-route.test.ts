import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Runs the real Resources → People API against a stand-in database that records every write,
 * so the save paths (edit, rename, curated edits, starter sources) are checked end to end.
 */
type Op = { table: string; action: string; values?: unknown; filters: Array<[string, unknown]> };
const db = vi.hoisted(() => ({ ops: [] as Op[], rows: {} as Record<string, unknown>, existingSources: [] as Array<{ id: string; title: string }> }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/corpus/api", async (original) => ({ ...(await original<typeof import("@/lib/corpus/api")>()), assertCorpusAdmin: () => null }));
vi.mock("@/lib/explore/live-people", async (original) => ({
  ...(await original<typeof import("@/lib/explore/live-people")>()),
  loadLiveProfiles: async () => [{ readiness: { blockers: [] } }],
}));
vi.mock("@/lib/supabase-admin", () => {
  function builder(table: string) {
    const op: Op = { table, action: "select", filters: [] };
    const result = () => {
      if (op.action === "select" && table === "personalities") return { data: db.rows[table] ?? [], error: null };
      if (op.action === "select" && table === "sources") return { data: db.existingSources, error: null };
      if (op.action === "select" && table === "categories") return { data: { id: "c" }, error: null };
      if (op.action === "insert" && table === "sources") return { data: { id: "new-source", title: "t" }, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (values: unknown) => { op.action = "insert"; op.values = values; db.ops.push(op); return chain; },
      update: (values: unknown) => { op.action = "update"; op.values = values; db.ops.push(op); return chain; },
      upsert: (values: unknown) => { op.action = "upsert"; op.values = values; db.ops.push(op); return chain; },
      delete: () => { op.action = "delete"; db.ops.push(op); return chain; },
      single: async () => table === "personalities" && op.action === "select" ? { data: db.rows.person, error: null } : result(),
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    for (const name of ["eq", "neq", "in", "not", "order", "limit"]) chain[name] = (...args: unknown[]) => { op.filters.push([name, args]); return chain; };
    return chain;
  }
  return { supabaseAdmin: { from: builder } };
});

const RAMAN = "6b9a4d86-8330-4256-a749-4daf0f596128";
const ADDED = "11111111-1111-4111-8111-111111111111";
const settings = {
  group: "scientists", shortName: "Bhabha",
  era: { label: "1909–1966", short: "1909–1966", sortYear: 1909, period: "20th century" },
  region: { label: "Bombay", broad: ["West India"] }, wikipediaTitle: null,
  photo: { url: "https://example.supabase.co/storage/v1/object/public/portraits/a.jpg", credit: "Tata Institute" },
  angles: [{ lens: "scientific", title: "The work", question: "What did he build?" }],
};
const patch = async (body: unknown) => {
  const { PATCH } = await import("@/app/api/resources/people/route");
  return PATCH(new NextRequest("http://localhost/api/resources/people", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
};
const writes = (table: string, action: string) => db.ops.filter((op) => op.table === table && op.action === action);

describe("Resources → People API", () => {
  beforeEach(async () => {
    db.ops = []; db.existingSources = [];
    const { getPhase1People } = await import("@/lib/phase1/dataset");
    expect(getPhase1People().some((person) => person.id === RAMAN)).toBe(true);
  });

  it("saves edits to an added person, with a photo and a starter source linked for review", async () => {
    db.rows.person = { id: ADDED, canonical_name: "Homi J. Bhabha", explore_profile: { ...settings, published: false, photo: null } };
    db.rows.personalities = [];
    const response = await patch({ personalityId: ADDED, settings, alternateNames: [], sources: [{ url: "https://www.britannica.com/biography/Homi-Jehangir-Bhabha", title: "", sourceType: "biography" }] });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sources: { added: 1, reused: 0 } });
    const saved = writes("personalities", "update")[0].values as { explore_profile: { photo: unknown; published: boolean } };
    expect(saved.explore_profile.photo).toEqual(settings.photo);
    expect(saved.explore_profile.published).toBe(false);
    expect(writes("sources", "insert")[0].values).toMatchObject({ title: "britannica.com: Homi Jehangir Bhabha", source_type: "biography", source_status: "candidate", url: "https://www.britannica.com/biography/Homi-Jehangir-Bhabha" });
    expect(writes("source_personalities", "upsert")[0].values).toMatchObject({ source_id: "new-source", personality_id: ADDED });
  });

  it("links an already-recorded web address instead of storing it twice", async () => {
    db.rows.person = { id: ADDED, canonical_name: "Homi J. Bhabha", explore_profile: { ...settings, published: false } };
    db.existingSources = [{ id: "old-source", title: "Bhabha biography" }];
    const response = await patch({ personalityId: ADDED, sources: [{ url: "https://www.britannica.com/biography/Homi-Jehangir-Bhabha" }] });
    expect(await response.json()).toMatchObject({ sources: { added: 0, reused: 1 } });
    expect(writes("sources", "insert")).toHaveLength(0);
    expect(writes("source_personalities", "upsert")[0].values).toMatchObject({ source_id: "old-source" });
  });

  it("renames an added person and keeps the old name as an alias", async () => {
    db.rows.person = { id: ADDED, canonical_name: "Homi Bhabha", explore_profile: { ...settings, published: true } };
    db.rows.personalities = [{ id: "x", canonical_name: "Someone Else" }];
    const response = await patch({ personalityId: ADDED, name: "Homi J. Bhabha", settings });
    expect(await response.json()).toMatchObject({ slug: "homi-j-bhabha", published: true });
    expect(writes("personalities", "update")[0].values).toMatchObject({ canonical_name: "Homi J. Bhabha" });
    const aliases = writes("personality_aliases", "insert")[0].values as Array<{ alias: string; alias_type: string }>;
    expect(aliases).toEqual(expect.arrayContaining([expect.objectContaining({ alias: "Homi Bhabha", alias_type: "alternate_name" })]));
  });

  it("refuses a rename that would clash with someone else", async () => {
    db.rows.person = { id: ADDED, canonical_name: "Homi Bhabha", explore_profile: { ...settings, published: true } };
    db.rows.personalities = [{ id: "x", canonical_name: "Homi J Bhabha" }];
    const response = await patch({ personalityId: ADDED, name: "Homi J. Bhabha" });
    expect(response.status).toBe(409);
    expect(writes("personalities", "update")).toHaveLength(0);
  });

  it("saves presentation edits to a curated profile and keeps it on Explore", async () => {
    db.rows.person = { id: RAMAN, canonical_name: "C. V. Raman", explore_profile: null };
    const response = await patch({ personalityId: RAMAN, settings: { ...settings, shortName: "Raman" }, alternateNames: ["Sir C. V. Raman"] });
    expect(response.status).toBe(200);
    const saved = writes("personalities", "update")[0].values as { explore_profile: { shortName: string; published: boolean }; alternate_names: string[] };
    expect(saved.explore_profile).toMatchObject({ shortName: "Raman", published: true });
    expect(saved.alternate_names).toEqual(["Sir C. V. Raman"]);
    expect(writes("personality_categories", "upsert")).toHaveLength(0);
  });

  it("keeps a curated profile's name and research category fixed", async () => {
    db.rows.person = { id: RAMAN, canonical_name: "C. V. Raman", explore_profile: null };
    expect((await patch({ personalityId: RAMAN, name: "Chandrasekhara Venkata Raman" })).status).toBe(409);
    expect((await patch({ personalityId: RAMAN, categoryId: "22222222-2222-4222-8222-222222222222" })).status).toBe(409);
    expect((await patch({ personalityId: RAMAN, published: false })).status).toBe(409);
    expect(writes("personalities", "update")).toHaveLength(0);
  });

  it("rejects a photo link that is not https", async () => {
    db.rows.person = { id: ADDED, canonical_name: "Homi J. Bhabha", explore_profile: null };
    const response = await patch({ personalityId: ADDED, settings: { ...settings, photo: { url: "http://example.com/a.jpg", credit: "" } } });
    expect(response.status).toBe(400);
  });
});
