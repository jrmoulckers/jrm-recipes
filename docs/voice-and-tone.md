# Voice & tone

How Heirloom talks. Heirloom is a warm, family-first recipe keeper, so our words
should feel like a helpful relative in the kitchen. Encouraging, plain-spoken,
and never clinical or salesy.

## Principles

- **Warm, not corporate.** Write the way you'd talk to family. Prefer "your
  people", "the dish everyone asks you to make" over "users" and "content".
- **Encouraging, never blaming.** When something goes wrong, say what to do next.
  Never blame the person.
- **Short and glanceable.** Especially in the kitchen. Favor verbs and concrete
  nouns over abstractions.
- **Sentence case everywhere.** Buttons, headings, toasts, menu items, and any
  display label, including category and taxonomy labels.
- **One idea per sentence.** See [Punctuation](#punctuation) below. No em dashes,
  no semicolons joining clauses.

## Punctuation

**Never use an em dash (—) or a semicolon to join clauses.** Both smuggle two
thoughts into one sentence and make copy harder to scan in a kitchen. This
applies to every string we ship and to code comments, so the codebase stops
modelling the habit.

Reach for these instead, in order:

1. **Two sentences.** The default. "Your collections. Shelves for the dishes you
   love."
2. **A comma**, for a short appositive or trailing qualifier. "Back online,
   syncing your latest."
3. **A colon**, when introducing a list or an explanation.
4. **Parentheses**, only for a true aside.

Still allowed:

- The en dash (–) in numeric ranges: `12–24h`, `2–3 tbsp`.
- Semicolons that are code or protocol syntax (TypeScript statements, HTTP
  header values).
- Hyphens in compound words.
- A standalone `—` used as a "no data" glyph in a stat or table cell. That is
  typography, not phrasing.

### Trailing periods

- **No trailing period** on success confirmations and inline field errors.
  "Saved to your cookbook", "Add an ingredient".
- **Trailing period** on error toasts and banners. They are advisory sentences.
  "We couldn't find that.", "You don't have permission to do that."

### Ampersands

Use **"and"** in prose and in anything that reads as a sentence. Reserve **"&"**
for short standalone labels: nav items, settings titles, tags, chips.
"Units & measurements" as a page title, but "Cook Mode, meal planning and
shopping lists" in a sentence.

## Per-mode tone

The five UI modes live in `src/config/themes.ts`. Their behavior flags
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
celebrations. Keep the delight light. The recipe still matters more than the
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

## Toast voice

Success toasts split by area, so the same surface always sounds the same way.

| Area                                                         | Voice                                              | Examples                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Recipe, cook, journal, groups, collections                   | **Warm.** Active voice, name the thing, use "your" | "Saved to “Weeknights”", "Removed from your journal", "Your group is ready for the family table" |
| Settings, billing, moderation, blocked, units, notifications | **Terse.** Neutral and quiet                       | "Settings saved", "Profile removed", "Invite link revoked"                                       |

The warm areas are where people are cooking and sharing, so the app should sound
like a person. The terse areas are administrative, and a quiet confirmation
respects that the user is mid-task.

Error toasts are warm-but-calm everywhere, and always say what to do next.

## CTA vocabulary

The most important action in Heirloom, starting a cookbook and adding recipes,
should read the same way everywhere so it's learnable. Use exactly these labels:

| Intent                             | Label                        | Where                                              |
| ---------------------------------- | ---------------------------- | -------------------------------------------------- |
| Sign up (aspirational, signed-out) | **Start your cookbook**      | Landing hero, header sign-up, `StartCookingButton` |
| Create, first run / empty library  | **Create your first recipe** | `EmptyLibrary`, home closing CTA, onboarding       |
| Create, recipes already exist      | **Create a recipe**          | Per-page create buttons                            |
| Browse (secondary)                 | **Browse recipes**           | Anywhere we point at the library                   |

Rules:

- A single view must never show two different primary labels for the **same**
  action. The signed-out hero (sign-up) and a create button are different
  intents and may coexist. Two create buttons must read identically.
- Keep the icon (usually `ChefHat` for create/sign-up, `Compass` for browse).
  Only the label is standardized.
- These are copy-only. Never change the route or behavior to match a label.

## Destructive-action confirmations

Every confirm dialog for a delete / remove / leave follows one pattern:

**Verb + what's affected → consequence → reversibility.**

- Lead with the plain verb and the specific thing:
  "Delete this recipe?", "Remove {name} from this group?", "Leave {group}?"
- State the real consequence, and reassure about what is _not_ lost when true:
  "Everyone's recipes stay saved. Only the shared group space is removed."
- End with reversibility. If it can't be undone, say
  "This can't be undone." If it can, say how: "You can re-invite them anytime."
- Keep the body to two short sentences. Put the reassurance in its own sentence
  rather than pivoting mid-sentence.

## Kids mode

Kids mode (`THEME_BEHAVIOR.kids.kidSafe`) is a first-class experience: bigger
targets, simpler chrome, and simpler _words_. Adult microcopy stays put unless a
surface opts in through `src/config/kid-copy.ts`.

Guidelines for Kids variants:

- **Aim for a ~grade-2 reading level.** Short words, short sentences, one idea.
- **Be warm and encouraging.** "You did it! 🎉", "Let's add your favorite food."
- **Prefer concrete nouns.** "food" over "ingredient", "day" over "date".
- **One exclamation is plenty.** Enthusiasm, not shouting.
- Keep the map tiny. Only core flows (create CTA, library empty state, cook
  completion headline, top validation messages). It is not a full i18n layer.

Current variants live in `KID_COPY`. Read them with `pickKidCopy(kidSafe, …)`
(client, paired with `useThemeBehavior`) or `pickCopy(theme, …)`. Non-Kids modes
must be byte-for-byte unchanged.

## Share text

The words that ride along with a shared recipe link are content, not throwaway.
When a link lands in a family chat it should say _what_ it is and _whose_ it is.
It should never arrive as a naked URL.

- Name the recipe first, then a warm one-liner. With a known cook, attribute it:
  "{title}, from {cook}'s kitchen. Made with Heirloom."
- Without a cook, keep it familial and plain:
  "{title}, a family recipe on Heirloom."
- Keep it short enough for messaging apps. **No hashtags, no marketing fluff.**
- `navigator.share` gets the message as `text` and the link as `url`
  separately. The clipboard fallback copies "{text} {url}" together.
- Confirmations stay terse: "Recipe link copied".

The templates live in `src/lib/share-text.ts` so every share surface reads the
same voice.

## Page metadata

- The title template is `%s · Heirloom`. The separator is a **middle dot**,
  never an em dash.
- Utility routes may add one qualifier dot when it disambiguates otherwise
  identical pages: "Cook · Pot Roast · Heirloom", "Print · Pot Roast · Heirloom".
- `openGraph.title` does not inherit the template, so appending "· Heirloom"
  there by hand is correct.
- Descriptions follow the same voice as the rest of the site: warm, sentence
  case, one or two plain sentences.

## Accessibility microcopy (screen-reader text & aria-labels)

Screen-reader-only text and `aria-label`s are the entire interface for people
who can't see the screen. Treat them as first-class copy, not afterthoughts.

- **`{verb} {specific object}`.** Every icon-only control names what it acts on,
  so it's self-describing out of context. Say "Remove ingredient", not
  "Remove"; "Move step up", not "Move up". A screen reader should never
  announce a bare verb like "Remove, button".
- Prefer the concrete instance when it's available: "Remove {item}",
  "Remove {title} from plan", "Delete this journal entry".
- Localize these the same way as visible copy. Route them through the i18n
  catalog (e.g. `recipeEditor.removeNamed` = "Remove {object}"), never hardcode.
- Keep visually-hidden helpers (`<span className="sr-only">…</span>`) consistent
  with this convention when an icon needs extra spoken context.
- Use a comma, not a dash, to separate parts of a label. Screen readers pause on
  a comma: "{title}, step {position}".

## Onboarding & first-run

A first-time, empty account gets a short, encouraging welcome, not a wall of
instructions. Orient people to the core loop, then get out of the way.

- Lead with warmth and the payoff: "Welcome to Heirloom 👋" /
  "Three little steps to keep your family's recipes alive."
- Frame the loop as **create → cook → share**, one friendly line each. Keep
  step bodies to a single sentence and lead with a verb.
- One primary CTA ("Create your first recipe"). Everything else is quiet.
- Always dismissible ("Maybe later"), and dismissal sticks. Never nag on
  return visits, and never show once the user has content.
- Centralize the strings (`src/config/onboarding-copy.ts`) so the moment can be
  localized or mode-adapted later.
