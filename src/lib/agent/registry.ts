import { z } from "zod/v4";
import type { ToolDeclaration } from "@/lib/ai";

// ============================================
// Tool registry
//
// A tool is a Zod-typed function the model may call. The Zod schema is the
// single source of truth: it produces the JSON Schema the model sees and
// validates the arguments that come back, so a malformed call fails as a
// tool error the agent can react to rather than a crash.
// ============================================

/** Shared context every tool handler receives. */
export interface ToolContext {
  runId: string;
  lessonId?: string;
  courseId?: string;
  language: string;
  /** Appended to by tools that want to leave a note for later steps. */
  scratch: Record<string, unknown>;
}

export interface ToolDefinition<A = unknown, R = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<A>;
  handler: (args: A, ctx: ToolContext) => Promise<R>;
  /** Writes to the database. Used to gate tools by run mode. */
  mutates?: boolean;
}

/**
 * A tool with its argument type erased.
 *
 * ToolDefinition is invariant in its argument type, so a heterogeneous array of
 * concrete tools has no useful common supertype. Erasing at definition time
 * keeps each handler strongly typed against its own schema while letting the
 * registry hold them together.
 */
export interface ErasedTool {
  name: string;
  description: string;
  jsonSchema: Record<string, unknown>;
  parse: (raw: unknown) => { ok: true; data: unknown } | { ok: false; issues: string };
  run: (args: unknown, ctx: ToolContext) => Promise<unknown>;
  mutates: boolean;
}

/** Define a tool, keeping its argument type inferred inside the handler. */
export function defineTool<A, R>(def: ToolDefinition<A, R>): ErasedTool {
  const jsonSchema = z.toJSONSchema(def.schema) as Record<string, unknown>;
  delete jsonSchema.$schema;

  return {
    name: def.name,
    description: def.description,
    jsonSchema,
    mutates: def.mutates ?? false,
    parse(raw) {
      const result = def.schema.safeParse(raw);
      if (result.success) return { ok: true, data: result.data };
      return {
        ok: false,
        issues: result.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
      };
    },
    run(args, ctx) {
      return Promise.resolve(def.handler(args as A, ctx));
    },
  };
}

/** Build a name-keyed registry, rejecting duplicates. */
export function createRegistry(tools: readonly ErasedTool[]) {
  const byName = new Map<string, ErasedTool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
    byName.set(tool.name, tool);
  }

  return {
    get(name: string) {
      return byName.get(name);
    },
    names(): string[] {
      return [...byName.keys()];
    },
    /** The declarations handed to the model. */
    declarations(allow?: string[]): ToolDeclaration[] {
      const chosen = allow
        ? (allow.map((n) => byName.get(n)).filter(Boolean) as ErasedTool[])
        : [...byName.values()];
      return chosen.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.jsonSchema,
      }));
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;

/** The shape a tool always returns to the model. */
export type ToolOutcome =
  { ok: true; value: unknown } | { ok: false; error: string; retryable: boolean };

/**
 * Validate arguments and run one tool.
 *
 * Never throws: a failure is data the agent can act on — retry, pick another
 * tool, or change its plan — which is the difference between a tool call and
 * an ordinary function call.
 */
export async function runTool(
  registry: Registry,
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const tool = registry.get(name);
  if (!tool) {
    return {
      ok: false,
      error: `No tool named "${name}". Available: ${registry.names().join(", ")}`,
      retryable: false,
    };
  }

  const parsed = tool.parse(rawArgs);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `Invalid arguments for ${name} — ${parsed.issues}`,
      retryable: true,
    };
  }

  try {
    const value = await tool.run(parsed.data, ctx);
    return { ok: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Rate limits and timeouts are worth another attempt; bad input is not.
    const retryable = /rate limit|timeout|timed out|network|ECONN|503|429/i.test(message);
    return { ok: false, error: message, retryable };
  }
}
