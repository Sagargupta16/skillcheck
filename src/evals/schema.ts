import { z } from "zod";

/** evals.json schema: strict superset of Anthropic skill-creator's
 * evals/evals.json (the de-facto interchange format). skillcheck adds a
 * `triggers` array fusing Skill-Lab's 4-type taxonomy with skill-creator's
 * should_trigger polarity. Unknown extra keys are allowed and preserved. */

export const triggerTypeSchema = z.enum([
  "explicit",
  "implicit",
  "contextual",
  "negative",
]);

export const triggerSchema = z
  .object({
    id: z.string().min(1),
    type: triggerTypeSchema,
    prompt: z.string().min(1),
    should_trigger: z.boolean().optional(),
  })
  .loose();

export const evalCaseSchema = z
  .object({
    id: z.number().int(),
    prompt: z.string().min(1),
    expected_output: z.string().optional(),
    files: z.array(z.string()).optional(),
    expectations: z.array(z.string().min(1)).min(1),
  })
  .loose();

export const evalsFileSchema = z
  .object({
    skill_name: z.string().min(1),
    settings: z
      .object({
        runs_per_prompt: z.number().int().min(1).optional(),
        trigger_threshold: z.number().min(0).max(1).optional(),
      })
      .loose()
      .optional(),
    evals: z.array(evalCaseSchema).optional(),
    triggers: z.array(triggerSchema).optional(),
  })
  .loose();

export type EvalsFile = z.infer<typeof evalsFileSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
