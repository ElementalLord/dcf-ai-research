import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase-admin";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing." },
        { status: 500 }
      );
    }

    const body = await request.json();

    const personalityId = body.personalityId;
    const question = body.question?.trim();

    if (!personalityId || !question) {
      return NextResponse.json(
        { error: "Personality and question are required." },
        { status: 400 }
      );
    }

    // ======================================================
    // 1. GET PERSONALITY
    // ======================================================

    const {
      data: personality,
      error: personalityError,
    } = await supabaseAdmin
      .from("personalities")
      .select("id, canonical_name")
      .eq("id", personalityId)
      .single();

    if (personalityError) throw personalityError;


    // ======================================================
    // 2. FIND PERSONALITY'S PRIMARY CATEGORY
    // ======================================================

    const {
      data: categoryLinks,
      error: categoryError,
    } = await supabaseAdmin
      .from("personality_categories")
      .select(`
        category_id,
        is_primary,
        categories (
          id,
          slug,
          name
        )
      `)
      .eq("personality_id", personalityId);

    if (categoryError) throw categoryError;

    if (!categoryLinks || categoryLinks.length === 0) {
      throw new Error(
        "This personality does not have a research category."
      );
    }

    const primaryCategory =
      categoryLinks.find(
        (item: any) => item.is_primary
      ) || categoryLinks[0];

    const categoryId =
      primaryCategory.category_id;


    // ======================================================
    // 3. LOAD PARAMETER FRAMEWORK ONLY
    //    We are NOT loading all claims yet.
    // ======================================================

    const {
      data: parameters,
      error: parameterError,
    } = await supabaseAdmin
      .from("parameters")
      .select(`
        id,
        code,
        name,
        sort_order,
        parameter_fields (
          id,
          code,
          label
        )
      `)
      .eq("category_id", categoryId)
      .order("sort_order");

    if (parameterError) throw parameterError;

    if (!parameters || parameters.length === 0) {
      throw new Error(
        "No research framework exists for this personality."
      );
    }


    // ======================================================
    // 4. ASK GEMINI WHICH PARAMETERS ARE RELEVANT
    // ======================================================

    const parameterList = parameters
      .map(
        (parameter: any) =>
          `${parameter.code} | ${parameter.name}`
      )
      .join("\n");

    const routingPrompt = `
You are a retrieval router for the DCF Inspiring Personalities AI.

PERSONALITY:
${personality.canonical_name}

USER QUESTION:
${question}

AVAILABLE RESEARCH PARAMETERS:

${parameterList}

TASK:

Select ONLY the parameter codes that are genuinely relevant
to answering the user's question.

Rules:

- Return parameter codes only.
- One code per line.
- Do not explain your choices.
- Select multiple parameters only when necessary.
- Prefer 1–3 parameters.
- If the question is broad and genuinely requires the whole profile,
  return ALL.
- Do not invent parameter codes.

Example output:

textual_contribution
philosophy
`;

    const routingResponse =
      await ai.interactions.create({
        model: "gemini-3.6-flash",
        input: routingPrompt,
      });

    const routingText =
      routingResponse.output_text?.trim() || "";

    const validCodes = new Set(
      parameters.map(
        (parameter: any) =>
          parameter.code
      )
    );

    let selectedCodes: string[] = [];

    if (
      routingText
        .toUpperCase()
        .includes("ALL")
    ) {
      selectedCodes =
        parameters.map(
          (parameter: any) =>
            parameter.code
        );
    } else {
      selectedCodes =
        routingText
          .split(/\n|,/)
          .map((item) =>
            item
              .trim()
              .replace(
                /^[-*•\d.\s]+/,
                ""
              )
              .replace(/[`"'[\]]/g, "")
          )
          .filter(
            (code) =>
              validCodes.has(code)
          );
    }

    // Safety fallback:
    // if router output is malformed, search all parameters.
    if (selectedCodes.length === 0) {
      selectedCodes =
        parameters.map(
          (parameter: any) =>
            parameter.code
        );
    }


    // ======================================================
    // 5. CONVERT PARAMETERS -> FIELD IDS
    // ======================================================

    const selectedParameters =
      parameters.filter(
        (parameter: any) =>
          selectedCodes.includes(
            parameter.code
          )
      );

    const fieldIds =
      selectedParameters.flatMap(
        (parameter: any) =>
          (
            parameter.parameter_fields ||
            []
          ).map(
            (field: any) =>
              field.id
          )
      );

    if (fieldIds.length === 0) {
      return NextResponse.json({
        personality:
          personality.canonical_name,

        answer:
          "The approved knowledge base does not currently contain enough evidence to answer that fully.",

        evidence: [],
      });
    }


    // ======================================================
    // 6. RETRIEVE ONLY APPROVED CLAIMS
    //    FROM RELEVANT PARAMETERS
    // ======================================================

    const {
      data: claims,
      error: claimsError,
    } = await supabaseAdmin
      .from("claims")
      .select(`
        id,
        claim_text,
        claim_kind,
        certainty,
        review_status,

        parameter_fields (
          id,
          code,
          label,

          parameters (
            id,
            code,
            name
          )
        ),

        claim_sources (
          relationship,
          evidence_excerpt,
          page_or_section,

          sources (
            id,
            title,
            author,
            publisher_or_institution,
            source_type,
            url,
            citation,
            source_status
          )
        )
      `)
      .eq(
        "personality_id",
        personalityId
      )
      .eq(
        "review_status",
        "approved"
      )
      .in(
        "parameter_field_id",
        fieldIds
      );

    if (claimsError) throw claimsError;

    if (
      !claims ||
      claims.length === 0
    ) {
      return NextResponse.json({
        personality:
          personality.canonical_name,

        answer:
          "The approved knowledge base does not currently contain enough evidence to answer that fully.",

        evidence: [],

        retrievedParameters:
          selectedParameters.map(
            (parameter: any) =>
              parameter.name
          ),
      });
    }


    // ======================================================
    // 7. BUILD EVIDENCE RECORDS
    // ======================================================

    // ======================================================
    // 7A. RANK CLAIMS LOCALLY BEFORE SENDING TO GEMINI
    //
    // The Vishvamitra corpus is now large. We do NOT want to
    // send every claim from a selected parameter to Gemini.
    // Rank them against the actual user question and keep a
    // manageable evidence set.
    // ======================================================

    const STOP_WORDS = new Set([
      "the", "a", "an", "and", "or", "but", "of", "to",
      "in", "on", "for", "with", "about", "what", "who",
      "why", "how", "when", "where", "was", "were", "is",
      "are", "did", "does", "do", "his", "her", "their",
      "vishvamitra", "vishwamitra", "tell", "me", "explain"
    ]);

    const normalizeWords = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\\s]/g, " ")
        .split(/\\s+/)
        .filter(
          (word) =>
            word.length > 2 &&
            !STOP_WORDS.has(word)
        );

    const questionTerms =
      new Set(normalizeWords(question));

    const rankedClaims =
      [...claims]
        .map((claim: any) => {
          let field =
            claim.parameter_fields;

          if (Array.isArray(field)) {
            field = field[0];
          }

          let parameter =
            field?.parameters;

          if (Array.isArray(parameter)) {
            parameter = parameter[0];
          }

          const searchableText = [
            claim.claim_text,
            field?.label || "",
            field?.code || "",
            parameter?.name || "",
            parameter?.code || "",
          ].join(" ");

          const claimTerms =
            normalizeWords(searchableText);

          let score = 0;

          for (const word of claimTerms) {
            if (questionTerms.has(word)) {
              score += 3;
            }
          }

          // Give direct textual claims a slight preference.
          if (
            claim.review_status === "approved"
          ) {
            score += 1;
          }

          return {
            claim,
            score,
          };
        })
        .sort(
          (a: any, b: any) =>
            b.score - a.score
        )
        .slice(0, 24)
        .map(
          (item: any) =>
            item.claim
        );

    const evidence: any[] = [];

    for (
      const claim of rankedClaims as any[]
    ) {
      let field =
        claim.parameter_fields;

      if (Array.isArray(field)) {
        field = field[0];
      }

      let parameter =
        field?.parameters;

      if (
        Array.isArray(parameter)
      ) {
        parameter =
          parameter[0];
      }

      const links =
        claim.claim_sources || [];

      if (links.length === 0) {
        evidence.push({
          id:
            `E${evidence.length + 1}`,

          claim:
            claim.claim_text,

          claimKind:
            claim.claim_kind,

          certainty:
            claim.certainty,

          parameter:
            parameter?.name ||
            null,

          field:
            field?.label ||
            null,

          sourceTitle: null,
          sourceAuthor: null,
          sourceInstitution: null,
          evidenceExcerpt: null,
          pageOrSection: null,
          citation: null,
          url: null,
        });

        continue;
      }

      for (const link of links) {
        let source =
          link.sources;

        if (
          Array.isArray(source)
        ) {
          source =
            source[0];
        }

        evidence.push({
          id:
            `E${evidence.length + 1}`,

          claim:
            claim.claim_text,

          claimKind:
            claim.claim_kind,

          certainty:
            claim.certainty,

          parameter:
            parameter?.name ||
            null,

          field:
            field?.label ||
            null,

          relationship:
            link.relationship ||
            null,

          sourceTitle:
            source?.title ||
            null,

          sourceAuthor:
            source?.author ||
            null,

          sourceInstitution:
            source
              ?.publisher_or_institution ||
            null,

          sourceType:
            source?.source_type ||
            null,

          evidenceExcerpt:
            link.evidence_excerpt ||
            null,

          pageOrSection:
            link.page_or_section ||
            null,

          citation:
            source?.citation ||
            null,

          url:
            source?.url ||
            null,
        });
      }
    }


    // ======================================================
    // 8. FORMAT RETRIEVED EVIDENCE
    // ======================================================

    const context =
      evidence
        .map(
          (item) => `
[${item.id}]

PARAMETER:
${item.parameter || "Unknown"}

FIELD:
${item.field || "Unknown"}

CLAIM TYPE:
${item.claimKind}

CERTAINTY:
${item.certainty}

APPROVED CLAIM:
${item.claim}

SOURCE:
${item.sourceTitle || "No source title"}

${
  item.sourceAuthor
    ? `AUTHOR: ${item.sourceAuthor}`
    : ""
}

${
  item.sourceInstitution
    ? `INSTITUTION: ${item.sourceInstitution}`
    : ""
}

SUPPORTING EVIDENCE:
${
  item.evidenceExcerpt ||
  "No evidence excerpt stored"
}

LOCATION:
${
  item.pageOrSection ||
  "Not specified"
}
`
        )
        .join("\n");


    // ======================================================
    // 9. FINAL GROUNDED GEMINI ANSWER
    // ======================================================

    const answerPrompt = `
You are the DCF Inspiring Personalities AI.

PERSONALITY:

${personality.canonical_name}

USER QUESTION:

${question}

RETRIEVED APPROVED KNOWLEDGE:

${context}

STRICT RULES:

1. Answer using ONLY the retrieved approved knowledge above.

2. Do not use your pretrained knowledge as historical evidence.

3. Do not invent facts.

4. Every factual statement must be grounded in one or more evidence records.

5. Cite evidence using:
[E1]
[E2]
etc.

6. Preserve the distinction between:
- established fact
- textual tradition
- traditional account
- scholarly interpretation
- contested information
- uncertainty

7. Never present a scriptural or traditional account as independently verified historical fact.

8. If the retrieved evidence does not fully answer the question, explicitly say:

"The approved knowledge base does not currently contain enough evidence to answer that fully."

9. Do not invent citations.

10. Do not cite records that do not support the statement.

11. Use clear language suitable for students and general audiences.

12. Prefer a direct answer before additional explanation.
`;

    const answerResponse =
      await ai.interactions.create({
        model:
          "gemini-3.6-flash",

        input:
          answerPrompt,
      });

    const answer =
      answerResponse.output_text ||
      "Gemini returned no text.";


    // ======================================================
    // 10. RETURN RESULT
    // ======================================================

    return NextResponse.json({
      personality:
        personality.canonical_name,

      question,

      answer,

      retrievedParameters:
        selectedParameters.map(
          (parameter: any) => ({
            code:
              parameter.code,

            name:
              parameter.name,
          })
        ),

      evidence,

      routingInteractionId:
        routingResponse.id,

      answerInteractionId:
        answerResponse.id,
    });

  } catch (error: any) {
    console.error(
      "DCF retrieval error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          String(error) ||
          "Unknown retrieval error.",
      },
      { status: 500 }
    );
  }
}
