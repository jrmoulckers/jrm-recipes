# Voice & tone

How Heirloom talks. Heirloom is a warm, family-first recipe keeper, so our words
should feel like a helpful relative in the kitchen — encouraging, plain-spoken,
and never clinical or salesy.

## Principles

- **Warm, not corporate.** Write the way you'd talk to family. Prefer "your
  people", "the dish everyone asks you to make" over "users" and "content".
- **Encouraging, never blaming.** When something goes wrong, say what to do next.
  Never blame the person.
- **Short and glanceable.** Especially in the kitchen. Favor verbs and concrete
  nouns over abstractions.
- **Sentence case everywhere.** Buttons, headings, toasts, menu items.
- **No trailing period on short, single-line confirmations or field errors.**
  Reserve periods for multi-sentence copy.

## Per-mode tone

The five UI modes live in `src/config/themes.ts`; their behavior flags
(`THEME_BEHAVIOR`) can change how much help, safety, or simplicity a surface
needs. Keep the core Heirloom voice warm and plain-spoken, then tune the copy to
the active mode.

### Kitchen

Kitchen is the default: warm, homey, and gently encouraging. It should sound like
someone who knows the family recipe box and has time to help.

- Do: "Add the dish everyone asks you to make"
- Do: "Saved to your cookbook"
- Don't: "Create culinary content asset"
- Don't: "Boom! Recipe deployed!"

### Whimsy

Whimsy can be a little more playful and colorful, especially in empty states and
celebrations. Keep the delight light; the recipe still matters more than the
joke.

- Do: "Your cookbook is ready for its first favorite"
- Do: "A little kitchen magic saved"
- Don't: "LOL this recipe is iconic!!!"
- Don't: "Begin standardized recipe intake"

### Professional

Professional is quiet, confident, and editorial. Use precise words, fewer
exclamations, and copy that feels curated rather than cute.

- Do: "Recipe saved"
- Do: "Review details before sharing"
- Don't: "You crushed it! 🎉"
- Don't: "Uh oh, something got weird"

### Kids

Kids mode is a first-class experience with `kidSafe: true`: bigger targets,
simpler chrome, and simpler words. Follow the detailed [Kids mode](#kids-mode)
guidelines below instead of duplicating a second rule set here.

- Do: "Add a recipe!"
- Do: "Ask a grown-up to help"
- Don't: "Complete required safety validation"
- Don't: "One or more fields are invalid"

### Simple

Simple (`barebones`) is the plainest possible tone: calm, direct, and free of
decorative copy. It supports high contrast, reduced motion, and minimal chrome,
so the words should stay just as quiet.

- Do: "Save recipe"
- Do: "Delete this recipe?"
- Don't: "Sprinkle this into your cookbook"
- Don't: "A delightful little update is waiting"

_Per-mode tone added for #133._

## CTA vocabulary

The most important action in Heirloom — starting a cookbook and adding recipes —
should read the same way everywhere so it's learnable. Use exactly these labels:

| Intent | Label | Where |
| --- | --- | --- |
| Sign up (aspirational, signed-out) | **Start your cookbook** | Landing hero, header sign-up, `StartCookingButton` |
| Create — first run / empty library | **Create your first recipe** | `EmptyLibrary`, home closing CTA, onboarding |
| Create — recipes already exist | **Create a recipe** | Per-page create buttons |
| Browse (secondary) | **Browse recipes** | Anywhere we point at the library |

Rules:

- A single view must never show two different primary labels for the **same**
  action. The signed-out hero (sign-up) and a create button are different
  intents and may coexist; two create buttons must read identically.
- Keep the icon (usually `ChefHat` for create/sign-up, `Compass` for browse) —
  only the label is standardized.
- These are copy-only; never change the route or behavior to match a label.

## Destructive-action confirmations

Every confirm dialog for a delete / remove / leave follows one pattern:

**Verb + what's affected → consequence → reversibility.**

- Lead with the plain verb and the specific thing:
  "Delete this recipe?", "Remove {name} from this group?", "Leave {group}?"
- State the real consequence, and reassure about what is *not* lost when true:
  "Everyone's recipes stay saved — only the shared group space is removed."
- End with reversibility. If it can't be undone, say
  "This can't be undone." If it can, say how: "You can re-invite them anytime."
- Use an em dash (—) to pivot from consequence to reassurance; keep it to two
  short sentences.

## Kids mode

Kids mode (`THEME_BEHAVIOR.kids.kidSafe`) is a first-class experience: bigger
targets, simpler chrome — and simpler *words*. Adult microcopy stays put unless a
surface opts in through `src/config/kid-copy.ts`.

Guidelines for Kids variants:

- **Aim for a ~grade-2 reading level.** Short words, short sentences, one idea.
- **Be warm and encouraging.** "You did it! 🎉", "Let's add your favorite food."
- **Prefer concrete nouns.** "food" over "ingredient", "day" over "date".
- **One exclamation is plenty.** Enthusiasm, not shouting.
- Keep the map tiny — only core flows (create CTA, library empty state, cook
  completion headline, top validation messages). It is not a full i18n layer.

Current variants live in `KID_COPY`; read them with `pickKidCopy(kidSafe, …)`
(client, paired with `useThemeBehavior`) or `pickCopy(theme, …)`. Non-Kids modes
must be byte-for-byte unchanged.

## Share text

The words that ride along with a shared recipe link are content, not throwaway.
When a link lands in a family chat it should say *what* it is and *whose* it is —
never arrive as a naked URL.

- Name the recipe first, then a warm one-liner. With a known cook, attribute it:
  "{title}, from {cook}'s kitchen. Made with Heirloom."
- Without a cook, keep it familial and plain:
  "{title} — a family recipe on Heirloom."
- Keep it short enough for messaging apps. **No hashtags, no marketing fluff.**
- `navigator.share` gets the message as `text` and the link as `url`
  separately; the clipboard fallback copies "{text} {url}" together.
- Confirmations stay terse: "Recipe link copied".

The templates live in `src/lib/share-text.ts` so every share surface reads the
same voice.

## Accessibility microcopy (screen-reader text & aria-labels)

Screen-reader-only text and `aria-label`s are the entire interface for people
who can't see the screen — treat them as first-class copy, not afterthoughts.

- **`{verb} {specific object}`.** Every icon-only control names what it acts on,
  so it's self-describing out of context. Say "Remove ingredient", not
  "Remove"; "Move step up", not "Move up". A screen reader should never
  announce a bare verb like "Remove, button".
- Prefer the concrete instance when it's available: "Remove {item}",
  "Remove {title} from plan", "Delete this journal entry".
- Localize these the same way as visible copy — route them through the i18n
  catalog (e.g. `recipeEditor.removeNamed` = "Remove {object}"), never hardcode.
- Keep visually-hidden helpers (`<span className="sr-only">…</span>`) consistent
  with this convention when an icon needs extra spoken context.

## Onboarding & first-run

A first-time, empty account gets a short, encouraging welcome — not a wall of
instructions. Orient people to the core loop, then get out of the way.

- Lead with warmth and the payoff: "Welcome to Heirloom 👋" /
  "Three little steps to keep your family's recipes alive."
- Frame the loop as **create → cook → share**, one friendly line each. Keep
  step bodies to a single sentence and lead with a verb.
- One primary CTA ("Create your first recipe"); everything else is quiet.
- Always dismissible ("Maybe later"), and dismissal sticks — never nag on
  return visits, and never show once the user has content.
- Centralize the strings (`src/config/onboarding-copy.ts`) so the moment can be
  localized or mode-adapted later.




