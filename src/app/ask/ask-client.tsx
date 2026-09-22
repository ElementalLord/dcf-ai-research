"use client";

import { useState } from "react";
import Link from "next/link";

export type Personality = {
  id: string;
  canonical_name: string;
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
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(loadError);

  async function ask(event: React.FormEvent) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalityId,
          question,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "AI request failed.");
      }

      setAnswer(result.answer || "No answer returned.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "AI request failed.",
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

        {answer && (
          <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">
              Answer
            </h2>

            <div className="whitespace-pre-wrap leading-8">
              {answer}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
