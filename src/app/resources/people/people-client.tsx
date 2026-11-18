"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, LoaderCircle, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORY_ICONS, Check, Lotus } from "@/components/vedic-icons";
import {
  BROAD_REGIONS, ERA_PERIODS, EXPLORE_GROUPS, GROUP_CATEGORY_HINT, defaultShortName, fillAngles, periodForYear, shortEra,
  type ExploreGroupId, type ExploreProfileSettings,
} from "@/lib/explore/profile-settings";
import { monogram } from "../../explore/explore-data";
import { Expandable } from "@/components/expandable";

type Readiness = { shownClaims: number; shownSources: number; approvedClaims: number; pendingClaims: number; approvedSources: number; withheldContested: number; filledSections: string[]; emptySections: string[]; blockers: string[] };
type Person = { id: string; name: string; slug: string; alternateNames: string[]; category: { id: string; name: string } | null; curated: boolean; edited: boolean; sourceCount: number; settings: ExploreProfileSettings | null; readiness: Readiness | null; createdAt: string };
type Category = { id: string; slug: string; name: string; fieldCount: number };
type Angle = ExploreProfileSettings["angles"][number];
type SourceRow = { url: string; title: string; sourceType: string };
const SOURCE_TYPES: Array<[string, string]> = [["other", "Other"], ["biography", "Biography"], ["scholarly_book", "Scholarly book"], ["scholarly_article", "Scholarly article"], ["primary_text", "Original text"], ["autobiography", "Autobiography"], ["archival", "Archive"], ["institutional", "Institutional record"]];
const blankSource = (): SourceRow => ({ url: "", title: "", sourceType: "other" });

type Draft = {
  name: string; shortName: string; shortNameTouched: boolean; alternateNames: string; group: ExploreGroupId; categoryId: string;
  eraLabel: string; eraYear: string; undated: boolean; period: (typeof ERA_PERIODS)[number]; periodTouched: boolean;
  regionLabel: string; regions: string[]; wikipediaTitle: string; wikipediaTouched: boolean; angles: Angle[]; anglesTouched: boolean;
  photoUrl: string; photoCredit: string; sources: SourceRow[];
};

const blankDraft = (): Draft => ({
  name: "", shortName: "", shortNameTouched: false, alternateNames: "", group: "scientists", categoryId: "",
  eraLabel: "", eraYear: "", undated: false, period: "20th century", periodTouched: false,
  regionLabel: "", regions: [], wikipediaTitle: "", wikipediaTouched: false, angles: fillAngles("scientists", ""), anglesTouched: false,
  photoUrl: "", photoCredit: "", sources: [blankSource()],
});

function draftFrom(person: Person): Draft {
  const settings = person.settings!;
  return {
    name: person.name, shortName: settings.shortName, shortNameTouched: true, alternateNames: person.alternateNames.join(", "),
    group: settings.group, categoryId: person.category?.id ?? "", eraLabel: settings.era.label,
    eraYear: settings.era.sortYear === null ? "" : String(settings.era.sortYear), undated: settings.era.sortYear === null,
    period: settings.era.period, periodTouched: true, regionLabel: settings.region.label, regions: settings.region.broad,
    wikipediaTitle: settings.wikipediaTitle ?? "", wikipediaTouched: true, angles: settings.angles, anglesTouched: true,
    photoUrl: settings.photo?.url ?? "", photoCredit: settings.photo?.credit ?? "", sources: [blankSource()],
  };
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || `Request failed (${response.status})`);
  return data as T;
}

const json = { "Content-Type": "application/json" };
/** The research category a group most often uses: the first of its hints that exists, in hint order. */
const suggestedCategory = (categories: Category[], group: ExploreGroupId) =>
  GROUP_CATEGORY_HINT[group].map((slug) => categories.find((category) => category.slug === slug)).find(Boolean);
const yearValue = (draft: Draft) => draft.undated || !draft.eraYear.trim() ? null : Number.parseInt(draft.eraYear, 10);

/** What is missing from the form, in plain words. Empty means it can be saved. */
function formProblems(draft: Draft) {
  const problems: string[] = [];
  if (draft.name.trim().length < 2) problems.push("a name");
  if (!draft.categoryId) problems.push("a research category");
  if (draft.eraLabel.trim().length < 2) problems.push("an era");
  if (!draft.undated && draft.eraYear.trim() && !Number.isFinite(yearValue(draft))) problems.push("a whole-number year");
  if (draft.regionLabel.trim().length < 2) problems.push("a place");
  if (!draft.regions.length) problems.push("at least one broad region");
  if (draft.angles.some((angle) => angle.title.trim().length < 2 || angle.question.trim().length < 8)) problems.push("a title and question for each reading angle (or remove it)");
  if (draft.photoUrl.trim() && !isHttps(draft.photoUrl.trim())) problems.push("a photo link that starts with https://");
  if (draft.sources.some((row) => row.url.trim() && !isWebAddress(row.url.trim()))) problems.push("a full web address for each source (starting with https://)");
  if (draft.sources.some((row) => !row.url.trim() && row.title.trim().length === 1)) problems.push("a longer source title");
  return problems;
}

const isWebAddress = (value: string) => { try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; } };
const isHttps = (value: string) => isWebAddress(value) && value.toLowerCase().startsWith("https://");
const filledSources = (draft: Draft) => draft.sources.filter((row) => row.url.trim() || row.title.trim().length >= 2)
  .map((row) => ({ url: row.url.trim(), title: row.title.trim(), sourceType: row.sourceType }));

function toPayload(draft: Draft) {
  return {
    sources: filledSources(draft),
    alternateNames: draft.alternateNames.split(",").map((item) => item.trim()).filter(Boolean),
    categoryId: draft.categoryId,
    settings: {
      group: draft.group,
      shortName: (draft.shortName.trim() || defaultShortName(draft.name)),
      era: { label: draft.eraLabel.trim(), short: shortEra(draft.eraLabel.trim()), sortYear: yearValue(draft), period: draft.period },
      region: { label: draft.regionLabel.trim(), broad: draft.regions },
      wikipediaTitle: draft.wikipediaTitle.trim() || null,
      photo: draft.photoUrl.trim() ? { url: draft.photoUrl.trim(), credit: draft.photoCredit.trim() } : null,
      angles: draft.angles.map((angle) => ({ lens: angle.lens.trim() || "historical", title: angle.title.trim(), question: angle.question.trim() })),
    },
  };
}

function Status({ person }: { person: Person }) {
  if (person.settings?.published && !person.readiness?.blockers.length) return <span className="people-status is-live"><Check size={13} />On Explore</span>;
  if (person.settings?.published) return <span className="people-status is-hidden">Hidden: no approved claims</span>;
  if (person.readiness && !person.readiness.blockers.length) return <span className="people-status is-ready">Ready to publish</span>;
  return <span className="people-status">Draft</span>;
}

export default function PeopleClient() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [cardError, setCardError] = useState<{ id: string; message: string } | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => api<{ people: Person[]; categories: Category[] }>("/api/resources/people").then((data) => {
    setPeople(data.people);
    setCategories(data.categories);
    setLoadError("");
  }, (error: unknown) => {
    setLoadError(error instanceof Error && /authoriz/i.test(error.message) ? "Your Resources session has ended. Sign in again." : "People could not be loaded. Try again.");
  }), []);
  useEffect(() => { load(); }, [load]);

  const added = useMemo(() => (people || []).filter((person) => !person.curated), [people]);
  const curated = useMemo(() => (people || []).filter((person) => person.curated), [people]);
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  function chooseGroup(group: ExploreGroupId) {
    setDraft((current) => {
      const hinted = suggestedCategory(categories, group);
      const keepCategory = current.categoryId && categories.some((category) => category.id === current.categoryId && GROUP_CATEGORY_HINT[group].includes(category.slug));
      return {
        ...current, group,
        categoryId: keepCategory ? current.categoryId : hinted?.id ?? current.categoryId,
        angles: current.anglesTouched ? current.angles : fillAngles(group, current.shortName || defaultShortName(current.name)),
      };
    });
  }

  function openNew() {
    const fresh = blankDraft();
    fresh.categoryId = suggestedCategory(categories, fresh.group)?.id ?? "";
    setDraft(fresh);
    setFormError("");
    setEditing("new");
  }

  function setName(name: string) {
    setDraft((current) => {
      const shortName = current.shortNameTouched ? current.shortName : defaultShortName(name);
      return { ...current, name, shortName, wikipediaTitle: current.wikipediaTouched ? current.wikipediaTitle : name.trim(), angles: current.anglesTouched ? current.angles : fillAngles(current.group, shortName) };
    });
  }

  function setYear(value: string) {
    setDraft((current) => {
      const year = value.trim() ? Number.parseInt(value, 10) : null;
      return { ...current, eraYear: value, period: current.periodTouched || (year !== null && !Number.isFinite(year)) ? current.period : periodForYear(year) };
    });
  }

  function setAngle(index: number, patch: Partial<Angle>) {
    setDraft((current) => ({ ...current, anglesTouched: true, angles: current.angles.map((angle, position) => position === index ? { ...angle, ...patch } : angle) }));
  }

  async function save() {
    const problems = formProblems(draft);
    if (problems.length) { setFormError(`Add ${problems.join(", ")}.`); return; }
    setBusy("form");
    setFormError("");
    try {
      const payload = toPayload(draft);
      type Saved = { sources?: { added: number; reused: number }; sourceError?: string | null };
      const sourceNote = (result: Saved) => {
        const count = (result.sources?.added ?? 0) + (result.sources?.reused ?? 0);
        if (result.sourceError) return ` The details were saved, but some sources were not: ${result.sourceError}`;
        return count ? ` ${count} ${count === 1 ? "source was" : "sources were"} added for review in Sources & claims.` : "";
      };
      if (editing === "new") {
        const result = await api<Saved>("/api/resources/people", { method: "POST", headers: json, body: JSON.stringify({ name: draft.name.trim(), ...payload }) });
        setNotice(`${draft.name.trim()} was added.${sourceNote(result)} Next, approve sources and claims, then publish.`);
      } else if (editing) {
        const { categoryId, ...rest } = payload;
        const body = editing.curated
          ? { personalityId: editing.id, ...rest }
          : { personalityId: editing.id, ...rest, categoryId, ...(draft.name.trim() !== editing.name ? { name: draft.name.trim() } : {}) };
        const result = await api<Saved>("/api/resources/people", { method: "PATCH", headers: json, body: JSON.stringify(body) });
        const live = editing.curated || editing.settings?.published;
        setNotice(`${draft.name.trim() || editing.name}: details saved.${live ? " Explore shows the change now." : ""}${sourceNote(result)}`);
      }
      setEditing(null);
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The person could not be saved. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setPublished(person: Person, published: boolean) {
    setBusy(person.id);
    setCardError(null);
    try {
      await api("/api/resources/people", { method: "PATCH", headers: json, body: JSON.stringify({ personalityId: person.id, published }) });
      setNotice(published ? `${person.name} is now on Explore.` : `${person.name} is hidden from Explore. Nothing was deleted.`);
      await load();
    } catch (error) {
      setCardError({ id: person.id, message: error instanceof Error ? error.message : "That did not work. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function uploadPhoto(file: File) {
    setFormError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setFormError("Use a JPG, PNG or WebP photo."); return; }
    if (file.size > 4 * 1024 * 1024) { setFormError("The photo must be 4 MB or smaller."); return; }
    setBusy("photo");
    try {
      const body = new FormData();
      body.append("file", file);
      const { url } = await api<{ url: string }>("/api/resources/people/photo", { method: "POST", body });
      update({ photoUrl: url });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The photo could not be uploaded. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function openEdit(person: Person) {
    setDraft(person.settings ? { ...draftFrom(person), name: person.name } : { ...blankDraft(), name: person.name, categoryId: person.category?.id ?? "" });
    setFormError("");
    setEditing(person);
  }

  function setSource(index: number, patch: Partial<SourceRow>) {
    setDraft((current) => ({ ...current, sources: current.sources.map((row, position) => position === index ? { ...row, ...patch } : row) }));
  }

  const problems = formProblems(draft);
  const curatedEditing = editing !== null && editing !== "new" && editing.curated;
  const previewGroup = EXPLORE_GROUPS.find((group) => group.id === draft.group)!;
  const PreviewIcon = CATEGORY_ICONS[draft.group] ?? Lotus;

  const matches = (person: Person) => !search.trim() || `${person.name} ${person.alternateNames.join(" ")} ${person.category?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
  const shownAdded = added.filter(matches);
  const shownCurated = curated.filter(matches);

  function renderRow(person: Person) {
    const ready = person.readiness;
    const live = person.curated || Boolean(person.settings?.published && !ready?.blockers.length);
    const group = EXPLORE_GROUPS.find((item) => item.id === person.settings?.group);
    const Icon = CATEGORY_ICONS[person.settings?.group ?? ""] ?? Lotus;
    return <li key={person.id} className={`people-row cat-${person.settings?.group ?? "sages"}`}>
      <span className="people-row-mark" aria-hidden="true">{person.settings?.photo
        // eslint-disable-next-line @next/next/no-img-element -- a stored photo at its own size; no optimiser needed.
        ? <img src={person.settings.photo.url} alt="" referrerPolicy="no-referrer" />
        : monogram(person.name)}</span>
      <div className="people-row-main">
        <h3>{person.name}{person.curated && person.edited && <small className="people-tag">Edited</small>}</h3>
        <p><Icon size={13} aria-hidden="true" />{group?.name ?? "No Explore group yet"}{person.settings ? ` · ${person.settings.era.short}` : ""}{person.category ? ` · ${person.category.name}` : ""} · {person.sourceCount} {person.sourceCount === 1 ? "source" : "sources"}</p>
        {!person.curated && (person.settings && ready
          ? <p className="people-row-note">{ready.approvedSources} approved {ready.approvedSources === 1 ? "source" : "sources"} · {ready.shownClaims} {ready.shownClaims === 1 ? "claim" : "claims"} ready{ready.pendingClaims ? ` · ${ready.pendingClaims} awaiting review` : ""}{ready.blockers.length && !live ? ` — to publish: ${ready.blockers.join(" ")}` : ""}</p>
          : <p className="people-row-note">Explore details are missing. Choose Edit to add them.</p>)}
        {cardError?.id === person.id && <p className="form-error" role="alert">{cardError.message}</p>}
      </div>
      {person.curated ? <span className="people-status is-live"><Check size={13} />On Explore</span> : <Status person={person} />}
      <div className="people-actions">
        <button type="button" className="key" onClick={() => openEdit(person)}><Pencil size={14} aria-hidden="true" />Edit</button>
        <Link className="key" href={`/resources?person=${person.id}`}>Sources &amp; claims</Link>
        {!person.curated && person.settings && (person.settings.published
          ? <button type="button" className="key" disabled={busy === person.id} onClick={() => void setPublished(person, false)}>{busy === person.id ? "Hiding…" : "Unpublish"}</button>
          : <button type="button" className="key key-hot" disabled={busy === person.id || Boolean(ready?.blockers.length)} title={ready?.blockers.join(" ")} onClick={() => void setPublished(person, true)}>{busy === person.id ? "Publishing…" : "Publish"}</button>)}
        {live && <a className="people-link" href={`/explore/${person.slug}`} target="_blank" rel="noreferrer" aria-label={`View ${person.name} on Explore`}>View <ArrowUpRight size={14} /></a>}
      </div>
    </li>;
  }

  return <div className="people">
    <div className="people-toolbar">
      <label className="people-search"><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a person" aria-label="Find a person" /></label>
      <button type="button" className="key key-hot people-add" onClick={openNew} disabled={!people}><Plus size={17} aria-hidden="true" />Add a person</button>
    </div>

    {notice && <p className="people-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button></p>}
    {loadError && <p className="resource-error" role="alert">{loadError} <button type="button" className="key" onClick={() => void load()}>Retry</button></p>}
    {!people && !loadError && <p className="people-loading" role="status"><LoaderCircle size={16} className="animate-spin" />Loading people…</p>}

    {people && <section className="people-section" aria-labelledby="people-added">
      <h2 id="people-added">Added in Resources <small>{added.length}</small></h2>
      {!added.length ? <p className="people-empty">No one has been added yet. Choose <strong>Add a person</strong> to start.</p>
        : shownAdded.length ? <Expandable count={shownAdded.length} noun="people" height={460}><ul className="people-list">{shownAdded.map(renderRow)}</ul></Expandable>
        : <p className="people-empty">No added person matches “{search}”.</p>}
    </section>}

    {people && <section className="people-section" aria-labelledby="people-curated">
      <h2 id="people-curated">Curated collection <small>{curated.length}</small></h2>
      <p className="people-help">Always on Explore. Editing changes how they are presented (short name, other names, era, place, group, photo and reading angles); their reviewed text stays as exported.</p>
      {shownCurated.length ? <Expandable count={shownCurated.length} noun="curated profiles" height={460}><ul className="people-list">{shownCurated.map(renderRow)}</ul></Expandable> : <p className="people-empty">No curated person matches “{search}”.</p>}
    </section>}

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
      <DialogContent className="people-dialog">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Add a person" : `Edit ${editing?.name ?? ""}`}</DialogTitle>
          <DialogDescription>{editing === "new" ? "Saved as a draft. Nothing appears on Explore until you publish." : curatedEditing ? "A curated profile. Changes appear on Explore as soon as you save." : "Changes to a published person appear on Explore as soon as you save."}</DialogDescription>
        </DialogHeader>
        <form className="people-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset>
            <legend>Who</legend>
            <label>Full name *<input value={draft.name} onChange={(event) => setName(event.target.value)} disabled={curatedEditing} maxLength={160} placeholder="For example, Homi J. Bhabha" autoFocus={editing === "new"} /></label>
            {curatedEditing ? <span className="people-help">Curated names are fixed, because their reviewed text and Explore address depend on them.</span>
              : editing !== "new" && <span className="people-help">Renaming changes the Explore address. The old name is kept as another name, so search still finds it.</span>}
            <div className="people-pair">
              <label>Short name<input value={draft.shortName} onChange={(event) => update({ shortName: event.target.value, shortNameTouched: true })} maxLength={80} placeholder="Bhabha" /><span className="people-help">Used in running text, such as “Ask about Bhabha”.</span></label>
              <label>Other names<input value={draft.alternateNames} onChange={(event) => update({ alternateNames: event.target.value })} placeholder="Separate with commas" /><span className="people-help">Helps search and Ask recognise the person.</span></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Photo</legend>
            <div className="people-photo">
              <span className="people-photo-preview" aria-hidden="true">{draft.photoUrl.trim() && isHttps(draft.photoUrl.trim())
                // eslint-disable-next-line @next/next/no-img-element -- preview of the chosen photo.
                ? <img src={draft.photoUrl.trim()} alt="" referrerPolicy="no-referrer" />
                : monogram(draft.name.trim() || "?")}</span>
              <div className="people-photo-controls">
                <label className="key people-upload">{busy === "photo" ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} aria-hidden="true" />}{busy === "photo" ? "Uploading…" : "Upload a photo"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy === "photo"} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadPhoto(file); }} />
                </label>
                {draft.photoUrl && <button type="button" className="key" onClick={() => update({ photoUrl: "", photoCredit: "" })}>Remove photo</button>}
                <span className="people-help">JPG, PNG or WebP, up to 4 MB. A square, face-centred photo looks best.</span>
              </div>
            </div>
            <div className="people-pair">
              <label>Or paste a photo link<input value={draft.photoUrl} onChange={(event) => update({ photoUrl: event.target.value })} maxLength={2000} placeholder="https://…" inputMode="url" /></label>
              <label>Photo credit<input value={draft.photoCredit} onChange={(event) => update({ photoCredit: event.target.value })} maxLength={300} placeholder="Photographer or archive" /><span className="people-help">Shown on the profile beside the photo.</span></label>
            </div>
            <label>Wikipedia article (used when there is no photo)<input value={draft.wikipediaTitle} onChange={(event) => update({ wikipediaTitle: event.target.value, wikipediaTouched: true })} maxLength={200} placeholder="For example, Homi J. Bhabha" /><span className="people-help">The article&apos;s lead image becomes the portrait, credited automatically. Clear it to show initials.</span></label>
            {draft.wikipediaTitle.trim() && <a className="people-link" href={`https://en.wikipedia.org/wiki/${encodeURIComponent(draft.wikipediaTitle.trim().replace(/ /g, "_"))}`} target="_blank" rel="noreferrer">Check the article <ArrowUpRight size={14} /></a>}
          </fieldset>

          <fieldset>
            <legend>Where they appear</legend>
            <div className="people-groups" role="radiogroup" aria-label="Explore group">{EXPLORE_GROUPS.map((group) => {
              const Icon = CATEGORY_ICONS[group.id] ?? Lotus;
              return <button type="button" role="radio" aria-checked={draft.group === group.id} key={group.id} className={`people-group cat-${group.id}`} onClick={() => chooseGroup(group.id)}><Icon size={18} />{group.name}</button>;
            })}</div>
            <label>Research category *<select value={draft.categoryId} onChange={(event) => update({ categoryId: event.target.value })} disabled={curatedEditing}>
              <option value="" disabled>Choose a category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.fieldCount ? ` (${category.fieldCount} research fields)` : ""}</option>)}
            </select><span className="people-help">{curatedEditing ? "Fixed for curated profiles, because their reviewed claims are filed under it." : "Decides which research fields claims can be filed under, and so which profile section each claim appears in."}</span></label>
          </fieldset>

          <fieldset>
            <legend>When and where</legend>
            <label>Era *<input value={draft.eraLabel} onChange={(event) => update({ eraLabel: event.target.value })} maxLength={120} placeholder="For example, 1909–1966, or c. 3rd century BCE" /></label>
            <div className="people-pair">
              <label>Approximate year<input inputMode="numeric" value={draft.undated ? "" : draft.eraYear} onChange={(event) => setYear(event.target.value)} disabled={draft.undated} placeholder="Birth year; negative for BCE" /><span className="people-help">Orders the timeline.</span></label>
              <label>Timeline period<select value={draft.period} onChange={(event) => update({ period: event.target.value as Draft["period"], periodTouched: true })}>{ERA_PERIODS.map((period) => <option key={period}>{period}</option>)}</select><span className="people-help">Filled in from the year; change it if needed.</span></label>
            </div>
            <label className="people-check"><input type="checkbox" checked={draft.undated} onChange={(event) => setDraft((current) => ({ ...current, undated: event.target.checked, period: event.target.checked && !current.periodTouched ? "Vedic and epic tradition" : current.period }))} />Traditional figure with no reliable date</label>
            <label>Place *<input value={draft.regionLabel} onChange={(event) => update({ regionLabel: event.target.value })} maxLength={160} placeholder="For example, Bombay (Mumbai), Maharashtra" /></label>
            <div className="people-regions" role="group" aria-label="Broad region (for the region filter)"><span>Broad region *</span>{BROAD_REGIONS.map((region) => <label key={region} className="people-check"><input type="checkbox" checked={draft.regions.includes(region)} onChange={(event) => update({ regions: event.target.checked ? [...draft.regions, region].slice(0, 4) : draft.regions.filter((item) => item !== region) })} />{region}</label>)}</div>
          </fieldset>

          <fieldset>
            <legend>Sources to add <small>(optional)</small></legend>
            <span className="people-help">{editing !== "new" && editing ? `${editing.sourceCount} already linked. ` : ""}Paste a web address, a title, or both. Each one is added for review in Sources &amp; claims; nothing is used in answers until it is approved there.</span>
            {draft.sources.map((row, index) => <div className="people-source" key={index}>
              <input aria-label={`Source ${index + 1} web address`} value={row.url} onChange={(event) => setSource(index, { url: event.target.value })} maxLength={2000} placeholder="https://…" inputMode="url" />
              <input aria-label={`Source ${index + 1} title`} value={row.title} onChange={(event) => setSource(index, { title: event.target.value })} maxLength={500} placeholder="Title (optional with a link)" />
              <select aria-label={`Source ${index + 1} type`} value={row.sourceType} onChange={(event) => setSource(index, { sourceType: event.target.value })}>{SOURCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <button type="button" className="key" aria-label={`Remove source ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, sources: current.sources.length > 1 ? current.sources.filter((_, position) => position !== index) : [blankSource()] }))}><Trash2 size={15} /></button>
            </div>)}
            {draft.sources.length < 20 && <div className="people-angle-actions"><button type="button" className="key" onClick={() => setDraft((current) => ({ ...current, sources: [...current.sources, blankSource()] }))}><Plus size={15} />Add another source</button></div>}
          </fieldset>

          <fieldset>
            <legend>Reading angles <small>(optional)</small></legend>
            <span className="people-help">Questions shown under “Ways in” on the profile. Pre-filled for the group; edit them so they fit this person.</span>
            {draft.angles.map((angle, index) => <div className="people-angle" key={index}>
              <input aria-label={`Angle ${index + 1} title`} value={angle.title} onChange={(event) => setAngle(index, { title: event.target.value })} maxLength={80} placeholder="Title" />
              <input aria-label={`Angle ${index + 1} question`} value={angle.question} onChange={(event) => setAngle(index, { question: event.target.value })} maxLength={300} placeholder="Question" />
              <button type="button" className="key" aria-label={`Remove angle ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, anglesTouched: true, angles: current.angles.filter((_, position) => position !== index) }))}><Trash2 size={15} /></button>
            </div>)}
            <div className="people-angle-actions">
              {draft.angles.length < 6 && <button type="button" className="key" onClick={() => setDraft((current) => ({ ...current, anglesTouched: true, angles: [...current.angles, { lens: "historical", title: "", question: "" }] }))}><Plus size={15} />Add angle</button>}
              <button type="button" className="key" onClick={() => update({ angles: fillAngles(draft.group, draft.shortName || defaultShortName(draft.name)), anglesTouched: false })}>Reset to suggestions</button>
            </div>
          </fieldset>

          <div className={`people-preview cat-${draft.group}`} aria-label="Preview of the Explore card">
            <span className="people-preview-label">On Explore</span>
            <span className="people-preview-mark" aria-hidden="true">{draft.photoUrl.trim() && isHttps(draft.photoUrl.trim())
              // eslint-disable-next-line @next/next/no-img-element -- preview of the chosen photo.
              ? <img src={draft.photoUrl.trim()} alt="" referrerPolicy="no-referrer" />
              : monogram(draft.name.trim() || "?")}</span>
            <span><strong>{draft.name.trim() || "Name"}</strong><small><PreviewIcon size={13} />{previewGroup.name} · {shortEra(draft.eraLabel.trim()) || "Era"} · {draft.regions[0] || "Region"}</small></span>
          </div>

          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="people-form-actions">
            <button type="button" className="key" onClick={() => setEditing(null)} disabled={busy === "form"}>Cancel</button>
            <button type="submit" className="key key-hot" disabled={busy === "form" || busy === "photo"} title={problems.length ? `Still needed: ${problems.join(", ")}` : undefined}>{busy === "form" ? "Saving…" : editing === "new" ? "Add person" : "Save changes"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
