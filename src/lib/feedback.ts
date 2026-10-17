import { z } from "zod";

export const feedbackTags = ["Inaccurate", "Weak sources", "Missing information", "Too vague", "Hard to understand", "Other"] as const;

export const feedbackSubmissionSchema = z.object({
  token: z.string().min(20).max(100_000),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2_000).default(""),
  tags: z.array(z.enum(feedbackTags)).max(feedbackTags.length).refine(tags => new Set(tags).size === tags.length).default([]),
}).strict();

export const feedbackContextSchema = z.object({
  responseId: z.string().uuid(),
  question: z.string().min(2).max(4_000),
  answer: z.string().min(1).max(60_000),
  personalityId: z.string().uuid().nullable(),
  personalityName: z.string().min(1).max(300),
  citations: z.array(z.object({
    id: z.string().max(100), kind: z.string().max(60), title: z.string().max(500),
    url: z.string().max(2_000).nullable(), claimId: z.string().max(100).optional(),
    chunkId: z.string().max(100).optional(), pageOrSection: z.string().max(300).nullable(),
  })).max(30),
  usedLiveSearch: z.boolean(),
  answerMode: z.string().max(80),
  provider: z.string().max(100).nullable(),
  model: z.string().max(200).nullable(),
  requestId: z.string().max(300).nullable(),
});

export type FeedbackContext = z.infer<typeof feedbackContextSchema>;
export type FeedbackTag = typeof feedbackTags[number];

export const legacyFeedbackSubmissionSchema = feedbackSubmissionSchema.omit({ token: true }).extend({
  legacyContext: feedbackContextSchema,
}).strict();
