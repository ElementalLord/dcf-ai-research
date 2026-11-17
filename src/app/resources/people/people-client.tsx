"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORY_ICONS, Check, Lotus } from "@/components/vedic-icons";
import {
  BROAD_REGIONS, ERA_PERIODS, EXPLORE_GROUPS, GROUP_CATEGORY_HINT, defaultShortName, fillAngles, periodForYear, shortEra,
  type ExploreGroupId, type ExploreProfileSettings,
} from "@/lib/explore/profile-settings";
import { monogram } from "../../explore/explore-data";

type Readiness = { shownClaims: number; shownSources: number; approvedClaims: number; pendingClaims: number; approvedSources: number; withheldContested: number; filledSections: string[]; emptySections: string[]; blockers: string[] };
type Person = { id: string; name: string; slug: string; alternateNames: string[]; category: { id: string; name: string } | null; curated: boolean; settings: ExploreProfileSettings | null; readiness: Readiness | null; createdAt: string };
type Category = { id: string; slug: string; name: string; fieldCount: number };
type Angle = ExploreProfileSettings["angles"][number];

type Draft = {
  name: string; shortName: string; shortNameTouched: boolean; alternateNames: string; group: ExploreGroupId; categoryId: string;
  eraLabel: string; eraYear: string; undated: boolean; period: (typeof ERA_PERIODS)[number]; periodTouched: boolean;
  regionLabel: string; regions: string[]; wikipediaTitle: string; wikipediaTouched: boolean; angles: Angle[]; anglesTouched: boolean;
};

const blankDraft = (): Draft => ({
  name: "", shortName: "", shortNameTouched: false, alternateNames: "", group: "scientists", categoryId: "",
  eraLabel: "", eraYear: "", undated: false, period: "20th century", periodTouched: false,
  regionLabel: "", regions: [], wikipediaTitle: "", wikipediaTouched: false, angles: fillAngles("scientists", ""), anglesTouched: false,
});

function draftFrom(person: Person): Draft {
  const settings = person.settings!;
  return {
    name: person.name, shortName: settings.shortName, shortNameTouched: true, alternateNames: person.alternateNames.join(", "),
    group: settings.group, categoryId: person.category?.id ?? "", eraLabel: settings.era.label,
    eraYear: settings.era.sortYear === null ? "" : String(settings.era.sortYear), undated: settings.era.sortYear === null,
    period: settings.era.period, periodTouched: true, regionLabel: settings.region.label, regions: settings.region.broad,
    wikipediaTitle: settings.wikipediaTitle ?? "", wikipediaTouched: true, angles: settings.angles, anglesTouched: true,
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
  return problems;
}

function toPayload(draft: Draft) {
  return {
    alternateNames: draft.alternateNames.split(",").map((item) => item.trim()).filter(Boolean),
    categoryId: draft.categoryId,
    settings: {
      group: draft.group,
      shortName: (draft.shortName.trim() || defaultShortName(draft.name)),
      era: { label: draft.eraLabel.trim(), short: shortEra(draft.eraLabel.trim()), sortYear: yearValue(draft), period: draft.period },
      region: { label: draft.regionLabel.trim(), broad: draft.regions },
      wikipediaTitle: draft.wikipediaTitle.trim() || null,
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
      if (editing === "new") {
        await api("/api/resources/people", { method: "POST", headers: json, body: JSON.stringify({ name: draft.name.trim(), ...payload }) });
        setNotice(`${draft.name.trim()} was added. Next, add sources and claims, then publish.`);
      } else if (editing) {
        await api("/api/resources/people", { method: "PATCH", headers: json, body: JSON.stringify({ personalityId: editing.id, ...payload }) });
        setNotice(`${editing.name}: details saved.${editing.settings?.published ? " Explore shows the change now." : ""}`);
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

  const problems = formProblems(draft);
  const previewGroup = EXPLORE_GROUPS.find((group) => group.id === draft.group)!;
  const PreviewIcon = CATEGORY_ICONS[draft.group] ?? Lotus;

  return <div className="people">
    <section className="people-steps" aria-label="How adding a person works">
      <ol>
        <li><span>1</span><div><strong>Add the person</strong><p>Name, group, era, region and portrait.</p></div></li>
        <li><span>2</span><div><strong>Add sources and claims</strong><p>Approve at least one source and one claim that cites it.</p></div></li>
        <li><span>3</span><div><strong>Publish to Explore</strong><p>The profile appears on Explore, the home page and Ask.</p></div></li>
      </ol>
      <button type="button" className="key key-hot people-add" onClick={openNew} disabled={!people}><Plus size={17} aria-hidden="true" />Add a person</button>
    </section>

    {notice && <p className="people-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button></p>}
    {loadError && <p className="resource-error" role="alert">{loadError} <button type="button" className="key" onClick={() => void load()}>Retry</button></p>}
    {!people && !loadError && <p className="people-loading" role="status"><LoaderCircle size={16} className="animate-spin" />Loading people…</p>}

    {people && <section className="people-section" aria-labelledby="people-added">
      <h2 id="people-added">Added in Resources <small>{added.length}</small></h2>
      {!added.length && <div className="people-empty"><p>No one has been added yet. Choose <strong>Add a person</strong> to start; the steps above show what happens next.</p></div>}
      <div className="people-cards">{added.map((person) => {
        const ready = person.readiness;
        const live = Boolean(person.settings?.published && !ready?.blockers.length);
        const group = EXPLORE_GROUPS.find((item) => item.id === person.settings?.group);
        const Icon = CATEGORY_ICONS[person.settings?.group ?? ""] ?? Lotus;
        return <article key={person.id} className={`people-card cat-${person.settings?.group ?? "sages"}`}>
          <header>
            <div><h3>{person.name}</h3><p><Icon size={14} />{group?.name ?? "No Explore group"}{person.settings ? ` · ${person.settings.era.short}` : ""}{person.category ? ` · ${person.category.name}` : ""}</p></div>
            <Status person={person} />
          </header>
          {person.settings && ready ? <ul className="people-checklist">
            <li className={ready.approvedSources ? "is-done" : ""}><Check size={14} aria-hidden="true" />{ready.approvedSources} approved {ready.approvedSources === 1 ? "source" : "sources"}</li>
            <li className={ready.shownClaims ? "is-done" : ""}><Check size={14} aria-hidden="true" />{ready.shownClaims} {ready.shownClaims === 1 ? "claim" : "claims"} ready to show{ready.pendingClaims ? ` · ${ready.pendingClaims} awaiting review` : ""}</li>
            <li className={ready.filledSections.length >= 3 ? "is-done" : "is-optional"}><Check size={14} aria-hidden="true" />{ready.filledSections.length ? `Sections covered: ${ready.filledSections.join(", ")}` : "No sections covered yet"}</li>
            {ready.withheldContested > 0 && <li className="is-optional"><Check size={14} aria-hidden="true" />{ready.withheldContested} contested {ready.withheldContested === 1 ? "claim needs" : "claims need"} a second independent source</li>}
          </ul> : <p className="people-card-note">Explore details are missing. Choose Edit details to add them.</p>}
          {ready?.blockers.length && !live ? <p className="people-card-note">To publish: {ready.blockers.join(" ")}</p> : null}
          {cardError?.id === person.id && <p className="form-error" role="alert">{cardError.message}</p>}
          <div className="people-actions">
            <Link className="key" href={`/resources?person=${person.id}`}>Add sources &amp; claims</Link>
            <button type="button" className="key" onClick={() => { setDraft(person.settings ? draftFrom(person) : { ...blankDraft(), name: person.name, categoryId: person.category?.id ?? "" }); setFormError(""); setEditing(person); }}>Edit details</button>
            {person.settings && (person.settings.published
              ? <button type="button" className="key" disabled={busy === person.id} onClick={() => void setPublished(person, false)}>{busy === person.id ? "Hiding…" : "Unpublish"}</button>
              : <button type="button" className="key key-hot" disabled={busy === person.id || Boolean(ready?.blockers.length)} title={ready?.blockers.join(" ")} onClick={() => void setPublished(person, true)}>{busy === person.id ? "Publishing…" : "Publish to Explore"}</button>)}
            {live && <a className="people-link" href={`/explore/${person.slug}`} target="_blank" rel="noreferrer">View on Explore <ArrowUpRight size={14} /></a>}
          </div>
        </article>;
      })}</div>
    </section>}

    {people && <details className="people-section people-curated">
      <summary><h2>Curated collection <small>{curated.length}</small></h2></summary>
      <p className="people-card-note">The original Phase 1 profiles come from the reviewed export and are always on Explore. Add sources and claims for them in Sources &amp; claims as usual.</p>
      <ul>{curated.map((person) => <li key={person.id}><Link href={`/explore/${person.slug}`} target="_blank">{person.name}</Link><span>{person.category?.name}</span></li>)}</ul>
    </details>}

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && busy !== "form") setEditing(null); }}>
      <DialogContent className="people-dialog">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "Add a person" : `Edit ${editing?.name ?? ""}`}</DialogTitle>
          <DialogDescription>{editing === "new" ? "Saved as a draft. Nothing appears on Explore until you publish." : "Changes to a published person appear on Explore as soon as you save."}</DialogDescription>
        </DialogHeader>
        <form className="people-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset>
            <legend>Who</legend>
            <label>Full name *<input value={draft.name} onChange={(event) => setName(event.target.value)} disabled={editing !== "new"} maxLength={160} placeholder="For example, Homi J. Bhabha" autoFocus={editing === "new"} /></label>
            {editing !== "new" && <span className="people-help">The name is fixed once the person exists, because sources and claims are linked to it.</span>}
            <div className="people-pair">
              <label>Short name<input value={draft.shortName} onChange={(event) => update({ shortName: event.target.value, shortNameTouched: true })} maxLength={80} placeholder="Bhabha" /><span className="people-help">Used in running text, such as “Ask about Bhabha”.</span></label>
              <label>Other names<input value={draft.alternateNames} onChange={(event) => update({ alternateNames: event.target.value })} placeholder="Separate with commas" /><span className="people-help">Helps search and Ask recognise the person.</span></label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Where they appear</legend>
            <div className="people-groups" role="radiogroup" aria-label="Explore group">{EXPLORE_GROUPS.map((group) => {
              const Icon = CATEGORY_ICONS[group.id] ?? Lotus;
              return <button type="button" role="radio" aria-checked={draft.group === group.id} key={group.id} className={`people-group cat-${group.id}`} onClick={() => chooseGroup(group.id)}><Icon size={18} />{group.name}</button>;
            })}</div>
            <label>Research category *<select value={draft.categoryId} onChange={(event) => update({ categoryId: event.target.value })}>
              <option value="" disabled>Choose a category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.fieldCount ? ` (${category.fieldCount} research fields)` : ""}</option>)}
            </select><span className="people-help">Decides which research fields claims can be filed under, and so which profile section each claim appears in.</span></label>
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
            <legend>Portrait</legend>
            <label>English Wikipedia article title<input value={draft.wikipediaTitle} onChange={(event) => update({ wikipediaTitle: event.target.value, wikipediaTouched: true })} maxLength={200} placeholder="For example, Homi J. Bhabha" /><span className="people-help">Filled in from the name. The portrait is the lead image of this article, credited automatically. Clear it to show initials instead.</span></label>
            {draft.wikipediaTitle.trim() && <a className="people-link" href={`https://en.wikipedia.org/wiki/${encodeURIComponent(draft.wikipediaTitle.trim().replace(/ /g, "_"))}`} target="_blank" rel="noreferrer">Check the article <ArrowUpRight size={14} /></a>}
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
            <span className="people-preview-mark" aria-hidden="true">{monogram(draft.name.trim() || "?")}</span>
            <span><strong>{draft.name.trim() || "Name"}</strong><small><PreviewIcon size={13} />{previewGroup.name} · {shortEra(draft.eraLabel.trim()) || "Era"} · {draft.regions[0] || "Region"}</small></span>
          </div>

          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="people-form-actions">
            <button type="button" className="key" onClick={() => setEditing(null)} disabled={busy === "form"}>Cancel</button>
            <button type="submit" className="key key-hot" disabled={busy === "form"} title={problems.length ? `Still needed: ${problems.join(", ")}` : undefined}>{busy === "form" ? "Saving…" : editing === "new" ? "Add person" : "Save details"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
