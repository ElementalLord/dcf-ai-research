"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Personality = {
  id: string;
  canonical_name: string;
  category_name?: string | null;
};

type Source = {
  id: string;
  title: string;
  author: string | null;
  publisher_or_institution: string | null;
  publication_year: number | null;
  source_type: string;
  url: string | null;
  citation: string | null;
  source_status: string;
};

type ClaimSource = {
  id: string;
  relationship: string;
  evidence_excerpt: string | null;
  page_or_section: string | null;
  notes: string | null;
  sources: Source | Source[] | null;
};

type Review = {
  id: string;
  reviewer_name: string | null;
  decision: string;
  notes: string | null;
  reviewed_at: string;
};

type Parameter = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
};

type ParameterField = {
  id: string;
  code: string;
  label: string;
  parameters: Parameter | Parameter[] | null;
};

type Claim = {
  id: string;
  claim_text: string;
  claim_kind: string;
  certainty: string;
  review_status:
    | "draft"
    | "needs_review"
    | "approved"
    | "rejected";
  researcher_notes: string | null;
  created_at: string;
  parameter_fields:
    | ParameterField
    | ParameterField[]
    | null;
  claim_sources: ClaimSource[];
  claim_reviews: Review[];
};

export default function ReviewPage() {
  const [personalities, setPersonalities] =
    useState<Personality[]>([]);

  const [personalityId, setPersonalityId] =
    useState("");

  const [claims, setClaims] =
    useState<Claim[]>([]);

  const [reviewerName, setReviewerName] =
    useState("Naitik Patel");

  const [reviewNotes, setReviewNotes] =
    useState<Record<string, string>>({});

  const [loading, setLoading] =
    useState(false);

  const [updatingId, setUpdatingId] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("");

  const [filter, setFilter] =
    useState<
      "all" |
      "draft" |
      "needs_review" |
      "approved" |
      "rejected"
    >("all");

  const loadPersonalities =
    useCallback(async () => {
      const response = await fetch(
        "/api/research/options"
      );

      const result =
        await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            "Could not load personalities."
        );
        return;
      }

      const list =
        result.personalities || [];

      setPersonalities(list);

      const vishvamitra =
        list.find(
          (person: Personality) =>
            person.canonical_name ===
            "Vishvamitra"
        );

      if (vishvamitra) {
        setPersonalityId(
          vishvamitra.id
        );
      } else if (list.length > 0) {
        setPersonalityId(
          list[0].id
        );
      }
    }, []);

  useEffect(() => {
    loadPersonalities();
  }, [loadPersonalities]);

  const loadClaims =
    useCallback(
      async (personId: string) => {
        if (!personId) return;

        setLoading(true);
        setMessage("");

        try {
          const response = await fetch(
            `/api/review/claims?personalityId=${encodeURIComponent(
              personId
            )}`
          );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ||
                "Could not load claims."
            );
          }

          setClaims(
            result.claims || []
          );
        } catch (error: any) {
          setMessage(error.message);
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    if (personalityId) {
      loadClaims(personalityId);
    }
  }, [personalityId, loadClaims]);

  const selectedPersonality =
    useMemo(
      () =>
        personalities.find(
          (person) =>
            person.id === personalityId
        ),
      [personalities, personalityId]
    );

  const counts = useMemo(() => {
    return {
      total: claims.length,

      draft: claims.filter(
        (claim) =>
          claim.review_status ===
          "draft"
      ).length,

      needsReview: claims.filter(
        (claim) =>
          claim.review_status ===
          "needs_review"
      ).length,

      approved: claims.filter(
        (claim) =>
          claim.review_status ===
          "approved"
      ).length,

      rejected: claims.filter(
        (claim) =>
          claim.review_status ===
          "rejected"
      ).length,
    };
  }, [claims]);

  const filteredClaims =
    useMemo(() => {
      if (filter === "all") {
        return claims;
      }

      return claims.filter(
        (claim) =>
          claim.review_status === filter
      );
    }, [claims, filter]);

  async function updateReview(
    claimId: string,
    status:
      | "approved"
      | "needs_review"
      | "rejected"
  ) {
    if (!reviewerName.trim()) {
      setMessage(
        "Enter a reviewer name first."
      );
      return;
    }

    setUpdatingId(claimId);
    setMessage("");

    try {
      const response = await fetch(
        "/api/review/update",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            claimId,
            status,
            reviewerName,
            notes:
              reviewNotes[claimId] ||
              "",
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Review update failed."
        );
      }

      setReviewNotes((old) => ({
        ...old,
        [claimId]: "",
      }));

      await loadClaims(
        personalityId
      );

      setMessage(
        "Review decision saved."
      );
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-12">

        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              DCF Inspiring Personalities AI
            </p>

            <h1 className="text-4xl font-bold tracking-tight">
              Claim Review
            </h1>

            <p className="mt-3 max-w-2xl text-zinc-600">
              Review evidence before
              information becomes usable
              by the AI.
            </p>
          </div>

          <a
            href="/"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            Research Workspace
          </a>
        </div>

        <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">

            <Field label="Personality">
              <select
                value={personalityId}
                onChange={(e) => {
                  setPersonalityId(
                    e.target.value
                  );

                  setFilter("all");
                }}
                className="input"
              >
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
            </Field>

            <Field label="Reviewer">
              <input
                value={reviewerName}
                onChange={(e) =>
                  setReviewerName(
                    e.target.value
                  )
                }
                className="input"
              />
            </Field>
          </div>
        </section>

        <section className="mb-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">

            <Metric
              label="Total claims"
              value={counts.total}
              active={filter === "all"}
              onClick={() =>
                setFilter("all")
              }
            />

            <Metric
              label="Draft"
              value={counts.draft}
              active={filter === "draft"}
              onClick={() =>
                setFilter("draft")
              }
            />

            <Metric
              label="Needs review"
              value={counts.needsReview}
              active={
                filter ===
                "needs_review"
              }
              onClick={() =>
                setFilter(
                  "needs_review"
                )
              }
            />

            <Metric
              label="Approved"
              value={counts.approved}
              active={
                filter === "approved"
              }
              onClick={() =>
                setFilter("approved")
              }
            />

            <Metric
              label="Rejected"
              value={counts.rejected}
              active={
                filter === "rejected"
              }
              onClick={() =>
                setFilter("rejected")
              }
            />
          </div>
        </section>

        {selectedPersonality && (
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">
              {
                selectedPersonality.canonical_name
              }
            </h2>

            <p className="text-sm text-zinc-500">
              Showing{" "}
              {filteredClaims.length}{" "}
              claim
              {filteredClaims.length ===
              1
                ? ""
                : "s"}
            </p>
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            {message}
          </div>
        )}

        {loading && (
          <p className="text-zinc-500">
            Loading claims...
          </p>
        )}

        <div className="space-y-6">
          {filteredClaims.map(
            (claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                note={
                  reviewNotes[
                    claim.id
                  ] || ""
                }
                setNote={(value) =>
                  setReviewNotes(
                    (old) => ({
                      ...old,
                      [claim.id]:
                        value,
                    })
                  )
                }
                updating={
                  updatingId ===
                  claim.id
                }
                updateReview={
                  updateReview
                }
              />
            )
          )}
        </div>
      </div>
    </main>
  );
}

function ClaimCard({
  claim,
  note,
  setNote,
  updating,
  updateReview,
}: {
  claim: Claim;
  note: string;
  setNote: (value: string) => void;
  updating: boolean;
  updateReview: (
    claimId: string,
    status:
      | "approved"
      | "needs_review"
      | "rejected"
  ) => Promise<void>;
}) {
  let field: any =
    claim.parameter_fields;

  if (Array.isArray(field)) {
    field = field[0];
  }

  let parameter: any =
    field?.parameters;

  if (Array.isArray(parameter)) {
    parameter = parameter[0];
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-500">
            {parameter?.name ||
              "Unknown parameter"}
          </p>

          <h3 className="mt-1 text-lg font-semibold">
            {field?.label ||
              "Unknown research field"}
          </h3>
        </div>

        <StatusBadge
          status={claim.review_status}
        />
      </div>

      <div className="mb-5 rounded-xl bg-zinc-50 p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Claim
        </p>

        <p className="leading-7">
          {claim.claim_text}
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">

        <SmallInfo
          label="Claim type"
          value={pretty(
            claim.claim_kind
          )}
        />

        <SmallInfo
          label="Certainty"
          value={pretty(
            claim.certainty
          )}
        />
      </div>

      {claim.researcher_notes && (
        <div className="mb-5">
          <p className="mb-2 text-sm font-semibold">
            Researcher notes
          </p>

          <p className="text-sm leading-6 text-zinc-600">
            {
              claim.researcher_notes
            }
          </p>
        </div>
      )}

      <div className="mb-6">
        <h4 className="mb-3 font-semibold">
          Evidence & Sources
        </h4>

        {claim.claim_sources?.length ? (
          <div className="space-y-3">

            {claim.claim_sources.map(
              (link) => {
                let source: any =
                  link.sources;

                if (
                  Array.isArray(source)
                ) {
                  source =
                    source[0];
                }

                return (
                  <div
                    key={link.id}
                    className="rounded-xl border border-zinc-200 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">

                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium">
                        {pretty(
                          link.relationship
                        )}
                      </span>

                      {source?.source_type && (
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs">
                          {pretty(
                            source.source_type
                          )}
                        </span>
                      )}

                      {source?.source_status && (
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs">
                          Source:{" "}
                          {pretty(
                            source.source_status
                          )}
                        </span>
                      )}
                    </div>

                    <p className="font-semibold">
                      {source?.title ||
                        "Unknown source"}
                    </p>

                    {source?.author && (
                      <p className="mt-1 text-sm text-zinc-600">
                        {
                          source.author
                        }
                      </p>
                    )}

                    {link.evidence_excerpt && (
                      <div className="mt-4 rounded-lg bg-zinc-50 p-4">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Evidence
                        </p>

                        <p className="text-sm leading-6">
                          {
                            link.evidence_excerpt
                          }
                        </p>
                      </div>
                    )}

                    {link.page_or_section && (
                      <p className="mt-3 text-sm text-zinc-500">
                        Location:{" "}
                        {
                          link.page_or_section
                        }
                      </p>
                    )}

                    {source?.citation && (
                      <p className="mt-2 text-sm text-zinc-500">
                        Citation:{" "}
                        {
                          source.citation
                        }
                      </p>
                    )}

                    {source?.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-medium underline"
                      >
                        Open source
                      </a>
                    )}
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
            No evidence linked.
          </div>
        )}
      </div>

      {claim.claim_reviews?.length >
        0 && (
        <div className="mb-6">
          <h4 className="mb-3 font-semibold">
            Review History
          </h4>

          <div className="space-y-2">
            {[...claim.claim_reviews]
              .sort(
                (a, b) =>
                  new Date(
                    b.reviewed_at
                  ).getTime() -
                  new Date(
                    a.reviewed_at
                  ).getTime()
              )
              .map((review) => (
                <div
                  key={review.id}
                  className="rounded-lg bg-zinc-50 p-3 text-sm"
                >
                  <p>
                    <span className="font-medium">
                      {review.reviewer_name ||
                        "Reviewer"}
                    </span>
                    {" · "}
                    {pretty(
                      review.decision
                    )}
                  </p>

                  {review.notes && (
                    <p className="mt-1 text-zinc-600">
                      {
                        review.notes
                      }
                    </p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <Field label="Review notes">
          <textarea
            rows={2}
            value={note}
            onChange={(e) =>
              setNote(
                e.target.value
              )
            }
            placeholder="Optional explanation, correction, or follow-up..."
            className="input resize-y"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">

        <button
          type="button"
          disabled={updating}
          onClick={() =>
            updateReview(
              claim.id,
              "approved"
            )
          }
          className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Approve
        </button>

        <button
          type="button"
          disabled={updating}
          onClick={() =>
            updateReview(
              claim.id,
              "needs_review"
            )
          }
          className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black hover:bg-amber-600 disabled:opacity-50"
        >
          Needs Review
        </button>

        <button
          type="button"
          disabled={updating}
          onClick={() =>
            updateReview(
              claim.id,
              "rejected"
            )
          }
          className="rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </article>
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
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-xl border border-zinc-900 bg-zinc-900 p-4 text-left text-white"
          : "rounded-xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50"
      }
    >
      <p
        className={
          active
            ? "text-sm text-zinc-300"
            : "text-sm text-zinc-500"
        }
      >
        {label}
      </p>

      <p className="mt-1 text-2xl font-bold">
        {value}
      </p>
    </button>
  );
}

function SmallInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>

      <p className="mt-1 font-medium">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const styles: Record<
    string,
    string
  > = {
    draft:
      "bg-zinc-100 text-zinc-700",
    needs_review:
      "bg-amber-100 text-amber-800",
    approved:
      "bg-emerald-100 text-emerald-800",
    rejected:
      "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        styles[status] ||
        "bg-zinc-100 text-zinc-700"
      }`}
    >
      {pretty(status)}
    </span>
  );
}

function pretty(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}
