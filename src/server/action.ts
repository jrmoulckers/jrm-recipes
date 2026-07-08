import "server-only";

import type { TypeOf, ZodTypeAny } from "zod";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import type { User } from "~/server/db/schema";
import {
  type ActionResult,
  fail,
  fromZodError,
} from "~/server/action-result";

/**
 * Composable server-action wrapper (#169).
 *
 * Every mutation used to repeat the same preamble: bail out with a
 * "needs a database" result, `safeParse` the input and translate Zod errors
 * into field errors, then `requireUser()` — before any real work. That
 * boilerplate obscured the mutation and made it easy to forget a guard.
 *
 * {@link authedAction} folds those three steps into one typed factory. The
 * handler receives the already-validated data plus the authenticated user, so
 * an action body is just its mutation + revalidation + error mapping.
 */

/** Centralized copy shown when an action needs a database but none is configured. */
export const NEEDS_DATABASE =
  "Recipes need a database. Set DATABASE_URL (see .env.example) to start saving.";

/**
 * Handler invoked once the guards pass. Receives the parsed `data`, the
 * authenticated `user`, and any leading context arguments (`ctx`) the action
 * was called with (e.g. a record id passed before the input payload).
 */
type ActionHandler<In, T, Ctx extends unknown[]> = (
  data: In,
  user: User,
  ...ctx: Ctx
) => Promise<ActionResult<T>>;

/**
 * Build a server action from a Zod schema and a handler. The returned function
 * takes any leading context arguments followed by the raw input payload
 * (`(...ctx, input)`), so an action like `updateRecipeAction(id, input)` keeps
 * its existing call signature while `createRecipeAction(input)` needs none.
 *
 * Generic inference flows from `input` (the schema) to the handler's `data`
 * argument, and `Ctx`/`T` are inferred from the handler, so call sites and
 * results stay fully typed with no `any`.
 */
export function authedAction<
  S extends ZodTypeAny,
  T,
  Ctx extends unknown[] = [],
>(config: {
  input: S;
  handler: ActionHandler<TypeOf<S>, T, Ctx>;
  /** Override the default DB-guard copy for this action. */
  noDbMessage?: string;
}): (...args: [...Ctx, TypeOf<S>]) => Promise<ActionResult<T>> {
  const { input, handler, noDbMessage = NEEDS_DATABASE } = config;
  return async (...args: [...Ctx, TypeOf<S>]): Promise<ActionResult<T>> => {
    if (!isDbConfigured()) return fail(noDbMessage);
    // The raw payload is always the final argument; anything before it is
    // context (e.g. a leading record id) forwarded to the handler.
    const raw = args[args.length - 1] as TypeOf<S>;
    const ctx = args.slice(0, -1) as Ctx;
    const parsed = input.safeParse(raw);
    if (!parsed.success) return fromZodError(parsed.error);
    const user = await requireUser();
    return handler(parsed.data, user, ...ctx);
  };
}
