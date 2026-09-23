"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";

type Personality = {
  id: string;
  canonical_name: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
};

type ParameterField = {
  id: string;
  code: string;
  label: string;
  sort_order: number;
};

type Parameter = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  parameter_fields: ParameterField[];
};

type Category = {
  id: string;
  slug: string;
  name: string;
  parameters: Parameter[];
};

type Source = {
  id: string;
  title: string;
  author: string | null;
  source_type: string;
  source_status: string;
};

type ProgressField = {
  id: string;
  code: string;
  label: string;
  claimCount: number;
  approvedCount: number;
  covered: boolean;
};

type ProgressParameter = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  status: "missing" | "partial" | "complete";
  totalFields: number;
  coveredFields: number;
  totalClaims: number;
  approvedClaims: number;
  fields: ProgressField[];
};

type ProgressData = {
  category: {
    id: string;
    slug: string;
    name: string;
  } | null;

  parameters: ProgressParameter[];

  overall: {
    totalFields: number;
    coveredFields: number;
    percentage: number;
    totalClaims: number;
    approvedClaims: number;
  };
};

export default function Home() {
  const [personalities, setPersonalities] =
    useState<Personality[]>([]);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [sources, setSources] =
    useState<Source[]>([]);

  const [personalityId, setPersonalityId] =
    useState("");

  const [categoryId, setCategoryId] =
    useState("");

  const [parameterId, setParameterId] =
    useState("");

  const [parameterFieldId, setParameterFieldId] =
    useState("");

  const [claimText, setClaimText] =
    useState("");

  const [claimKind, setClaimKind] =
    useState("established_fact");

  const [certainty, setCertainty] =
    useState("unknown");

  const [researcherNotes, setResearcherNotes] =
    useState("");

  const [sourceMode, setSourceMode] =
    useState<"existing" | "new">("existing");

  const [existingSourceId, setExistingSourceId] =
    useState("");

  const [sourceTitle, setSourceTitle] =
    useState("");

  const [sourceAuthor, setSourceAuthor] =
    useState("");

  const [sourcePublisher, setSourcePublisher] =
    useState("");

  const [sourceYear, setSourceYear] =
    useState("");

  const [sourceType, setSourceType] =
    useState("scholarly_book");

  const [sourceUrl, setSourceUrl] =
    useState("");

  const [sourceCitation, setSourceCitation] =
    useState("");

  const [evidenceExcerpt, setEvidenceExcerpt] =
    useState("");

  const [pageOrSection, setPageOrSection] =
    useState("");

  const [
    evidenceRelationship,
    setEvidenceRelationship,
  ] = useState("supports");

  const [status, setStatus] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [progress, setProgress] =
    useState<ProgressData | null>(null);

  const [progressLoading, setProgressLoading] =
    useState(false);

  const loadOptions = useCallback(async () => {
    const response = await fetch(
      "/api/research/options"
    );

    const result = await response.json();

    if (!response.ok) {
      setStatus(
        result.error ||
          "Failed to load database."
      );
      return;
    }

    setPersonalities(
      result.personalities || []
    );

    setCategories(
      result.categories || []
    );

    setSources(
      result.sources || []
    );
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const loadProgress = useCallback(
    async (personId: string) => {
      if (!personId) {
        setProgress(null);
        return;
      }

      setProgressLoading(true);

      try {
        const response = await fetch(
          `/api/research/progress?personalityId=${encodeURIComponent(
            personId
          )}`
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Could not load progress."
          );
        }

        setProgress(result);
      } catch (error: any) {
        setStatus(error.message);
      } finally {
        setProgressLoading(false);
      }
    },
    []
  );

  const selectedPersonality =
    useMemo(
      () =>
        personalities.find(
          (person) =>
            person.id === personalityId
        ),
      [personalities, personalityId]
    );

  const selectedCategory =
    useMemo(
      () =>
        categories.find(
          (category) =>
            category.id === categoryId
        ),
      [categories, categoryId]
    );

  const parameters = useMemo(() => {
    return [
      ...(selectedCategory?.parameters ||
        []),
    ].sort(
      (a, b) =>
        a.sort_order - b.sort_order
    );
  }, [selectedCategory]);

  const selectedParameter =
    useMemo(
      () =>
        parameters.find(
          (parameter) =>
            parameter.id === parameterId
        ),
      [parameters, parameterId]
    );

  const fields = useMemo(() => {
    return [
      ...(selectedParameter?.parameter_fields ||
        []),
    ].sort(
      (a, b) =>
        a.sort_order - b.sort_order
    );
  }, [selectedParameter]);

  function selectPersonality(
    newPersonalityId: string
  ) {
    setPersonalityId(
      newPersonalityId
    );

    setParameterId("");
    setParameterFieldId("");

    const person =
      personalities.find(
        (item) =>
          item.id === newPersonalityId
      );

    setCategoryId(
      person?.category_id || ""
    );

    loadProgress(
      newPersonalityId
    );
  }

  function selectProgressParameter(
    progressParameter: ProgressParameter
  ) {
    setParameterId(
      progressParameter.id
    );

    setParameterFieldId("");

    setTimeout(() => {
      document
        .getElementById(
          "research-entry"
        )
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 50);
  }

  async function saveResearch(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setStatus("");

    try {
      const response = await fetch(
        "/api/research/claim",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            personalityId,
            parameterFieldId,

            claimText,
            claimKind,
            certainty,
            researcherNotes,

            existingSourceId:
              sourceMode === "existing"
                ? existingSourceId
                : null,

            sourceTitle:
              sourceMode === "new"
                ? sourceTitle
                : null,

            sourceAuthor:
              sourceMode === "new"
                ? sourceAuthor
                : null,

            sourcePublisher:
              sourceMode === "new"
                ? sourcePublisher
                : null,

            sourceYear:
              sourceMode === "new"
                ? sourceYear
                : null,

            sourceType:
              sourceMode === "new"
                ? sourceType
                : null,

            sourceUrl:
              sourceMode === "new"
                ? sourceUrl
                : null,

            sourceCitation:
              sourceMode === "new"
                ? sourceCitation
                : null,

            evidenceExcerpt,
            pageOrSection,
            evidenceRelationship,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Could not save research."
        );
      }

      setStatus(
        "Research saved successfully."
      );

      setClaimText("");
      setResearcherNotes("");
      setEvidenceExcerpt("");
      setPageOrSection("");

      if (sourceMode === "new") {
        setSourceTitle("");
        setSourceAuthor("");
        setSourcePublisher("");
        setSourceYear("");
        setSourceUrl("");
        setSourceCitation("");

        await loadOptions();
      }

      await loadProgress(
        personalityId
      );
    } catch (error: any) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-6 py-12">

        <div className="mb-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            DCF Inspiring Personalities AI
          </p>

          <h1 className="text-4xl font-bold tracking-tight">
            Research Workspace
          </h1>

          <p className="mt-3 max-w-2xl text-zinc-600">
            Build the verified knowledge base
            one sourced claim at a time.
          </p>

          <nav className="mt-5 flex flex-wrap gap-2">
            <Link href="/review" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm">Review claims</Link>
            <Link href="/corpus" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm">Manage corpus</Link>
            <Link href="/ask" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm">Ask</Link>
          </nav>
        </div>

        <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Personality
          </h2>

          <select
            value={personalityId}
            onChange={(e) =>
              selectPersonality(
                e.target.value
              )
            }
            className="input"
          >
            <option value="">
              Select personality
            </option>

            {personalities.map(
              (person) => (
                <option
                  key={person.id}
                  value={person.id}
                >
                  {
                    person.canonical_name
                  }
                </option>
              )
            )}
          </select>

          {selectedPersonality && (
            <div className="mt-4 rounded-xl bg-zinc-50 p-4">
              <p className="text-sm text-zinc-500">
                Research framework
              </p>

              <p className="font-semibold">
                {selectedPersonality.category_name ||
                  "No category assigned"}
              </p>
            </div>
          )}
        </section>

        {personalityId && (
          <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">

            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  Research coverage
                </p>

                <h2 className="text-2xl font-semibold">
                  {selectedPersonality?.canonical_name}
                </h2>
              </div>

              {progress && (
                <div className="text-left sm:text-right">
                  <p className="text-3xl font-bold">
                    {progress.overall.percentage}%
                  </p>

                  <p className="text-sm text-zinc-500">
                    {
                      progress.overall
                        .coveredFields
                    }{" "}
                    of{" "}
                    {
                      progress.overall
                        .totalFields
                    }{" "}
                    fields researched
                  </p>
                </div>
              )}
            </div>

            {progress && (
              <>
                <div className="mb-6 h-3 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-all"
                    style={{
                      width: `${progress.overall.percentage}%`,
                    }}
                  />
                </div>

                <div className="mb-6 grid gap-3 sm:grid-cols-3">
                  <Metric
                    label="Research fields"
                    value={`${progress.overall.coveredFields}/${progress.overall.totalFields}`}
                  />

                  <Metric
                    label="Claims"
                    value={String(
                      progress.overall.totalClaims
                    )}
                  />

                  <Metric
                    label="Approved claims"
                    value={String(
                      progress.overall.approvedClaims
                    )}
                  />
                </div>

                <div className="space-y-3">
                  {progress.parameters.map(
                    (parameter) => (
                      <button
                        key={parameter.id}
                        type="button"
                        onClick={() =>
                          selectProgressParameter(
                            parameter
                          )
                        }
                        className="w-full rounded-xl border border-zinc-200 p-4 text-left transition hover:border-zinc-400 hover:bg-zinc-50"
                      >
                        <div className="flex items-start justify-between gap-4">

                          <div>
                            <p className="font-semibold">
                              {
                                parameter.name
                              }
                            </p>

                            <p className="mt-1 text-sm text-zinc-500">
                              {
                                parameter.coveredFields
                              }
                              /
                              {
                                parameter.totalFields
                              }{" "}
                              fields researched
                              {" · "}
                              {
                                parameter.totalClaims
                              }{" "}
                              claims
                            </p>
                          </div>

                          <StatusBadge
                            status={
                              parameter.status
                            }
                          />
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-zinc-700"
                            style={{
                              width:
                                parameter.totalFields ===
                                0
                                  ? "0%"
                                  : `${
                                      (parameter.coveredFields /
                                        parameter.totalFields) *
                                      100
                                    }%`,
                            }}
                          />
                        </div>
                      </button>
                    )
                  )}
                </div>
              </>
            )}

            {progressLoading && (
              <p className="text-sm text-zinc-500">
                Loading progress...
              </p>
            )}
          </section>
        )}

        {personalityId && categoryId && (
          <form
            id="research-entry"
            onSubmit={saveResearch}
            className="space-y-8 scroll-mt-6"
          >

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-semibold">
                1. Research Parameter
              </h2>

              <div className="mb-5">
                <p className="text-sm text-zinc-500">
                  Category
                </p>

                <p className="font-medium">
                  {
                    selectedPersonality?.category_name
                  }
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">

                <Field label="Parameter">
                  <select
                    required
                    value={parameterId}
                    onChange={(e) => {
                      setParameterId(
                        e.target.value
                      );

                      setParameterFieldId(
                        ""
                      );
                    }}
                    className="input"
                  >
                    <option value="">
                      Select parameter
                    </option>

                    {parameters.map(
                      (parameter) => (
                        <option
                          key={
                            parameter.id
                          }
                          value={
                            parameter.id
                          }
                        >
                          {
                            parameter.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </Field>

                <Field label="Specific Research Field">
                  <select
                    required
                    value={
                      parameterFieldId
                    }
                    disabled={
                      !parameterId
                    }
                    onChange={(e) =>
                      setParameterFieldId(
                        e.target.value
                      )
                    }
                    className="input"
                  >
                    <option value="">
                      Select field
                    </option>

                    {fields.map(
                      (field) => (
                        <option
                          key={field.id}
                          value={field.id}
                        >
                          {field.label}
                        </option>
                      )
                    )}
                  </select>
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-semibold">
                2. Research Claim
              </h2>

              <Field label="Claim">
                <textarea
                  required
                  rows={4}
                  value={claimText}
                  onChange={(e) =>
                    setClaimText(
                      e.target.value
                    )
                  }
                  placeholder="Enter one specific research claim..."
                  className="input resize-y"
                />
              </Field>

              <div className="mt-5 grid gap-5 md:grid-cols-2">

                <Field label="Claim Type">
                  <select
                    value={claimKind}
                    onChange={(e) =>
                      setClaimKind(
                        e.target.value
                      )
                    }
                    className="input"
                  >
                    <option value="established_fact">
                      Established Fact
                    </option>

                    <option value="textual_tradition">
                      Textual Tradition
                    </option>

                    <option value="scholarly_interpretation">
                      Scholarly Interpretation
                    </option>

                    <option value="traditional_account">
                      Traditional Account
                    </option>

                    <option value="contested">
                      Contested
                    </option>

                    <option value="uncertain">
                      Uncertain
                    </option>

                    <option value="contemporary_relevance">
                      Contemporary Relevance
                    </option>
                  </select>
                </Field>

                <Field label="Certainty">
                  <select
                    value={certainty}
                    onChange={(e) =>
                      setCertainty(
                        e.target.value
                      )
                    }
                    className="input"
                  >
                    <option value="unknown">
                      Unknown
                    </option>

                    <option value="high">
                      High
                    </option>

                    <option value="medium">
                      Medium
                    </option>

                    <option value="low">
                      Low
                    </option>
                  </select>
                </Field>
              </div>

              <div className="mt-5">
                <Field label="Researcher Notes">
                  <textarea
                    rows={3}
                    value={
                      researcherNotes
                    }
                    onChange={(e) =>
                      setResearcherNotes(
                        e.target.value
                      )
                    }
                    placeholder="Interpretation, uncertainty, follow-up questions..."
                    className="input resize-y"
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-semibold">
                3. Source
              </h2>

              <div className="mb-5 flex gap-3">

                <button
                  type="button"
                  onClick={() =>
                    setSourceMode(
                      "existing"
                    )
                  }
                  className={
                    sourceMode ===
                    "existing"
                      ? "rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white"
                      : "rounded-lg bg-zinc-100 px-4 py-2 text-sm"
                  }
                >
                  Existing source
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSourceMode(
                      "new"
                    )
                  }
                  className={
                    sourceMode ===
                    "new"
                      ? "rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white"
                      : "rounded-lg bg-zinc-100 px-4 py-2 text-sm"
                  }
                >
                  New source
                </button>
              </div>

              {sourceMode ===
              "existing" ? (
                <Field label="Source">
                  <select
                    required
                    value={
                      existingSourceId
                    }
                    onChange={(e) =>
                      setExistingSourceId(
                        e.target.value
                      )
                    }
                    className="input"
                  >
                    <option value="">
                      Select source
                    </option>

                    {sources.map(
                      (source) => (
                        <option
                          key={
                            source.id
                          }
                          value={
                            source.id
                          }
                        >
                          {
                            source.title
                          }
                          {source.author
                            ? ` — ${source.author}`
                            : ""}
                        </option>
                      )
                    )}
                  </select>
                </Field>
              ) : (
                <div className="grid gap-5 md:grid-cols-2">

                  <Field label="Title">
                    <input
                      required
                      value={
                        sourceTitle
                      }
                      onChange={(e) =>
                        setSourceTitle(
                          e.target.value
                        )
                      }
                      className="input"
                    />
                  </Field>

                  <Field label="Author">
                    <input
                      value={
                        sourceAuthor
                      }
                      onChange={(e) =>
                        setSourceAuthor(
                          e.target.value
                        )
                      }
                      className="input"
                    />
                  </Field>

                  <Field label="Publisher / Institution">
                    <input
                      value={
                        sourcePublisher
                      }
                      onChange={(e) =>
                        setSourcePublisher(
                          e.target.value
                        )
                      }
                      className="input"
                    />
                  </Field>

                  <Field label="Publication Year">
                    <input
                      type="number"
                      value={
                        sourceYear
                      }
                      onChange={(e) =>
                        setSourceYear(
                          e.target.value
                        )
                      }
                      className="input"
                    />
                  </Field>

                  <Field label="Source Type">
                    <select
                      value={
                        sourceType
                      }
                      onChange={(e) =>
                        setSourceType(
                          e.target.value
                        )
                      }
                      className="input"
                    >
                      <option value="primary_text">
                        Primary Text
                      </option>

                      <option value="scholarly_book">
                        Scholarly Book
                      </option>

                      <option value="scholarly_article">
                        Scholarly Article
                      </option>

                      <option value="biography">
                        Biography
                      </option>

                      <option value="autobiography">
                        Autobiography
                      </option>

                      <option value="archival">
                        Archival
                      </option>

                      <option value="institutional">
                        Institutional
                      </option>

                      <option value="dcf_content">
                        DCF Content
                      </option>

                      <option value="other">
                        Other
                      </option>
                    </select>
                  </Field>

                  <Field label="URL">
                    <input
                      type="url"
                      value={
                        sourceUrl
                      }
                      onChange={(e) =>
                        setSourceUrl(
                          e.target.value
                        )
                      }
                      className="input"
                    />
                  </Field>

                  <div className="md:col-span-2">
                    <Field label="Citation">
                      <textarea
                        rows={2}
                        value={
                          sourceCitation
                        }
                        onChange={(e) =>
                          setSourceCitation(
                            e.target.value
                          )
                        }
                        className="input resize-y"
                      />
                    </Field>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-semibold">
                4. Evidence
              </h2>

              <Field label="Supporting Evidence">
                <textarea
                  rows={5}
                  value={
                    evidenceExcerpt
                  }
                  onChange={(e) =>
                    setEvidenceExcerpt(
                      e.target.value
                    )
                  }
                  placeholder="Paste or summarize the part of the source that supports this claim..."
                  className="input resize-y"
                />
              </Field>

              <div className="mt-5 grid gap-5 md:grid-cols-2">

                <Field label="Page / Section">
                  <input
                    value={
                      pageOrSection
                    }
                    onChange={(e) =>
                      setPageOrSection(
                        e.target.value
                      )
                    }
                    placeholder="e.g. p. 52 or Rigveda 3.62.10"
                    className="input"
                  />
                </Field>

                <Field label="Relationship">
                  <select
                    value={
                      evidenceRelationship
                    }
                    onChange={(e) =>
                      setEvidenceRelationship(
                        e.target.value
                      )
                    }
                    className="input"
                  >
                    <option value="supports">
                      Supports
                    </option>

                    <option value="contradicts">
                      Contradicts
                    </option>

                    <option value="context">
                      Context
                    </option>
                  </select>
                </Field>
              </div>
            </section>

            <button
              disabled={saving}
              type="submit"
              className="w-full rounded-xl bg-zinc-900 px-5 py-4 font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Save Research Claim"}
            </button>

            {status && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                {status}
              </div>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium">
        {label}
      </span>

      {children}
    </label>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4">
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-1 text-xl font-semibold">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "missing" | "partial" | "complete";
}) {
  const styles = {
    missing:
      "bg-zinc-100 text-zinc-600",
    partial:
      "bg-amber-100 text-amber-800",
    complete:
      "bg-emerald-100 text-emerald-800",
  };

  const labels = {
    missing: "Missing",
    partial: "Partial",
    complete: "Complete",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
