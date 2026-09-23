"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchJsonWithTimeout } from "@/lib/client/fetch-json";

export type Personality = {
  id: string;
  canonical_name: string;
};

type AskResult = {
  answer: string;
  retrievedParameters?: Array<{ code: string; name: string }>;
  citations?: Array<{
    id: string;
    kind: "approved_claim" | "approved_source_passage";
    title: string;
    author: string | null;
    institution: string | null;
    url: string | null;
    pageOrSection: string | null;
    textualLayer: string | null;
    excerpt: string;
    claimId?: string;
    chunkId?: string;
  }>;
  conflicts?: Array<{ type: string; message: string; layers?: string[] }>;
  debug?: {
    lexicalResults: number;
    semanticResults: number;
    approvedClaimResults: number;
    mergedCandidates: number;
    finalSelectedEvidenceCount: number;
    semanticFallbackReason: string | null;
    latenciesMs: Record<string, number>;
  };
};

type AskClientProps = {
  personalities: Personality[];
  loadError: string;
};

export default function AskClient({
  personalities,
  loadError,
}: AskClientProps) {
  const preferredPersonality =
    personalities.find(
      (person) =>
        person.canonical_name.localeCompare("Vishvamitra", undefined, {
          sensitivity: "base",
        }) === 0,
    ) || personalities[0];

  const [personalityId, setPersonalityId] = useState(
    preferredPersonality?.id || "",
  );
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(loadError);

  async function ask(event: React.FormEvent) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const { response, payload } = await fetchJsonWithTimeout<AskResult & { error?: string | { message?: string } }>("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalityId,
          question,
        }),
      }, 120_000);

      if (!response.ok) {
        const apiError = payload.error;
        throw new Error(
          typeof apiError === "string"
            ? apiError
            : apiError?.message || "AI request failed.",
        );
      }

      setResult(payload);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "The request timed out after two minutes. Please try again."
          : err instanceof Error
            ? err.message
            : "AI request failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          DCF Inspiring Personalities AI
        </p>

        <h1 className="text-4xl font-bold">
          Ask the Knowledge Base
        </h1>

        <p className="mt-3 text-zinc-600">
          Answers use only approved research from Supabase.
        </p>

        <div className="mt-5 flex gap-3">
          <Link
            href="/"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm"
          >
            Research
          </Link>

          <Link
            href="/review"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm"
          >
            Review
          </Link>

          <Link
            href="/corpus"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm"
          >
            Corpus
          </Link>
        </div>

        <form
          onSubmit={ask}
          className="mt-8 space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label
              htmlFor="personality"
              className="mb-2 block text-sm font-medium"
            >
              Personality
            </label>

            <select
              id="personality"
              required
              value={personalityId}
              onChange={(e) => setPersonalityId(e.target.value)}
              className="input"
            >
              <option value="">Select personality</option>

              {personalities.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.canonical_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="question"
              className="mb-2 block text-sm font-medium"
            >
              Question
            </label>

            <textarea
              id="question"
              required
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What are Vishvamitra's major textual contributions?"
              className="input resize-y"
            />
          </div>

          <button
            disabled={loading || !personalityId}
            className="w-full rounded-xl bg-zinc-900 px-5 py-4 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Asking Gemini..." : "Ask Gemini"}
          </button>
        </form>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        {result && (
          <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">
              Answer
            </h2>

            <div className="whitespace-pre-wrap leading-8">
              {result.answer}
            </div>

            {result.retrievedParameters && result.retrievedParameters.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {result.retrievedParameters.map((parameter) => (
                  <span key={parameter.code} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                    {parameter.name}
                  </span>
                ))}
              </div>
            )}

            {result.conflicts && result.conflicts.length > 0 && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Conflict / variant detected</p>
                {result.conflicts.map((conflict) => <p key={conflict.type} className="mt-1">{conflict.message}</p>)}
              </div>
            )}

            {result.citations && result.citations.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold">Citations and evidence</h3>
                <div className="mt-3 space-y-3">
                  {result.citations.map((citation) => (
                    <details key={citation.id} className="rounded-xl border border-zinc-200 p-4">
                      <summary className="cursor-pointer font-medium">
                        [{citation.id}] {citation.title}
                      </summary>
                      <div className="mt-3 space-y-2 text-sm text-zinc-700">
                        <p>{citation.kind === "approved_claim" ? "Human-approved claim" : "Direct passage from an approved source"}</p>
                        {citation.author && <p>Author: {citation.author}</p>}
                        {citation.institution && <p>Institution: {citation.institution}</p>}
                        {citation.textualLayer && <p>Textual layer: {citation.textualLayer}</p>}
                        {citation.pageOrSection && <p>Location: {citation.pageOrSection}</p>}
                        <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 leading-6">{citation.excerpt}</p>
                        {citation.url && <a href={citation.url} target="_blank" rel="noreferrer" className="inline-block text-blue-700 underline">Open source</a>}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {process.env.NODE_ENV !== "production" && result.debug && (
              <details className="mt-8 rounded-xl bg-zinc-950 p-4 text-zinc-100">
                <summary className="cursor-pointer text-sm font-medium">Retrieval debug</summary>
                <pre className="mt-3 overflow-auto text-xs">{JSON.stringify(result.debug, null, 2)}</pre>
              </details>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
