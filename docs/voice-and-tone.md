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

### Apostrophes and quotation marks

Use the **straight ASCII apostrophe `'`**, never the curly `’`. Both render
almost identically, so a mixed codebase is impossible to keep consistent by eye
and impossible to grep reliably. One character, everywhere.

The one wrinkle is JSX. A straight `'` sitting in a **JSX text node** trips the
`react/no-unescaped-entities` ESLint rule, which is an error. Write `&apos;`
there: it renders as a straight apostrophe and satisfies the rule. This applies
only to JSX text. Apostrophes inside string props, and inside catalog values
passed through `t()`, need no escaping and should be typed straight.

```jsx
<p>You haven&apos;t saved a recipe yet</p>   {/* JSX text: escape it */}
<Input placeholder="What's cooking?" />      {/* prop: straight, as typed */}
```

Quotation marks are **per locale**, and each catalog is internally consistent:

| Locale | Marks | Example                       |
| ------ | ----- | ----------------------------- |
| `en`   | `“…”` | `Saved to “Weeknights”`       |
| `es`   | `«…»` | `Guardado en «Weeknights»`    |
| `de`   | `„…“` | `In „Weeknights“ gespeichert` |
| `ar`   | `«…»` | `«Weeknights»`                |

Never carry the English `“…”` into a translated catalog. It is the most common
tell that a string was copied rather than translated.

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

| Intent                             | Label                            | Where                                              |
| ---------------------------------- | -------------------------------- | -------------------------------------------------- |
| Sign up (aspirational, signed-out) | **Start your cookbook**          | Landing hero, header sign-up, `StartCookingButton` |
| Create, first run / empty library  | **Create your first recipe**     | `EmptyLibrary`, home closing CTA, onboarding       |
| Create, recipes already exist      | **Create a recipe**              | Per-page create buttons                            |
| Import from elsewhere              | **Import a recipe**              | `ImportRecipePanel`, paste-a-URL entry points      |
| Collections, empty state           | **Create your first collection** | `collections/page.tsx` empty state                 |
| After redeeming a gift             | **Go to your cookbook**          | `RedeemForm` success                               |
| Browse (secondary)                 | **Browse recipes**               | Anywhere we point at the library                   |

Rules:

- **"Start" is reserved for sign-up.** It is the one aspirational moment. Using
  it elsewhere ("Start cooking", "Start your first collection") dilutes it, so
  every other intent takes a concrete verb: create, import, browse, go to.
- A single view must never show two different primary labels for the **same**
  action. The signed-out hero (sign-up) and a create button are different
  intents and may coexist. Two create buttons must read identically.
- **Live experiments are exempt while running.** Copy under an active A/B test
  may deviate from this table. When the experiment concludes, the winning label
  must be folded back in here as the canonical label, and the losing variant
  deleted. An experiment is never a permanent excuse to sit outside the standard.
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

**Never use `window.confirm()`.** The native prompt cannot be styled, cannot be
translated, and ignores the catalog entirely, so it renders in English no matter
what locale the reader has chosen. Every destructive confirm uses the styled
`AlertDialog` with its copy in the message catalog.

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
- **Descriptions are required only where they can be seen.** A description earns
  its keep on routes that get indexed or shared: marketing, public recipes,
  public profiles, collections, groups, discover, share-token pages. Private app
  screens (settings, planner, shopping list, notifications) need a good title and
  nothing more. Writing filler descriptions nobody reads is worse than omitting
  them, because it dilutes the ones that matter.
- Routes that must never be indexed (print, cook, keepsake) set
  `robots: { index: false }` rather than relying on a description to carry them.
- No two routes share a title. If they would collide, qualify with a middle dot.

## Accessibility microcopy (screen-reader text and aria-labels)

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

### Alt text

- Every image that carries meaning gets real alt text. Recipe photos, avatars
  and step images always describe what they show.
- `alt=""` is correct only when an image is genuinely decorative **and** its
  meaning is already carried by adjacent text. A recipe card's photo sitting
  directly above the recipe title is the usual valid case.
- When you use `alt=""`, leave a short comment saying why. The empty string
  should read as a deliberate decision, not a skipped field. This is the only
  way a reviewer can tell the two apart.
- A card's cover image is the usual valid empty case, but only when the link
  around it also contains the title. If a link wraps the image _alone_, `alt=""`
  leaves that link with no accessible name. Either name it or, when a second
  link to the same place sits right beside it, take the image link out of the
  accessibility tree with `aria-hidden` and `tabIndex={-1}`.
- Open Graph cards are rendered to a PNG by satori, so the `alt` on an `<img>`
  inside one does nothing. The real text alternative is `export const alt` in
  the route's `opengraph-image.tsx`. Those stay English: Next requires a static
  module-level value, so they cannot be resolved per request through the
  catalog. They are read by link-preview crawlers, not by the app's readers.

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

## Enforcement

A standard nobody can enforce is a suggestion. Most of the drift this document
corrects happened because the linter could not see it: `i18next/no-literal-string`
ran as a warning, in `jsx-only` mode, across four attributes, which made it blind
to every string in a `.ts` file. That is where the toasts and server-action errors
live, so the majority of user-facing copy never reached the catalog.

The migration ran as a ratchet rather than a big-bang rewrite. Area by area, as
each gained its i18n namespace, `i18next/no-literal-string` was raised from warn
to **error** for that directory, and the `--max-warnings` cap in the `lint`
script was lowered to the new total. The count could fall but never rise.

That backlog is now empty, so the ratchet has been retired. The rule is
**error globally**, with a single override turning it off for non-shipping code
(tests, fixtures, seed data, and `/design`).

Global is the stronger setting, not merely the tidier one. An allowlist of
finished directories only protects directories someone remembered to list, so a
newly created one would start out unguarded, which is exactly the state the
ratchet existed to escape. Enforcing globally means new code is compliant by
default and an exemption has to be argued for in the config.

Practically: put user-facing copy in `src/messages/*` from the first commit.
There is no longer a warn tier to land in.

### The guards

The linter only sees JSX, so four checks run alongside it in CI. Run them all
locally with `pnpm copy:check`.

| Command                  | Catches                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `pnpm i18n:validate`     | Missing, extra, or untranslated keys, ICU drift, and banned punctuation |
| `pnpm i18n:english-leak` | Values reworded but left in English                                     |
| `pnpm i18n:rich-tags`    | A `t.rich` tag with no handler, which throws at runtime                 |
| `pnpm a11y:alt-audit`    | Hardcoded or unjustified `alt` text                                     |

Each exists because something got past everything else:

- **English leakage.** `i18n:validate` flags a value only when it is
  byte-identical to English. A value that was reworded and left in English
  differs from the source, so parity, identity, and the linter all pass it.
  Roughly 750 keys once shipped that way, under fully translated key names.
- **Rich-text tags.** next-intl throws when a message contains a tag the
  `t.rich` call has no handler for. TypeScript does not read catalog values and
  the linter does not either, so this crashes in production, in one locale only.
  The check unions the tags across all locales, because a translator can keep a
  tag the English source dropped.
- **Alt text.** A skipped `alt` and a deliberate one are identical in code. The
  comment required above is what makes the difference reviewable, so it is
  enforced rather than requested.

Two rules of thumb, both learned the hard way on this branch:

1. **A gate must test the property you actually care about.** Agents asked to
   translate and then verify reported "in sync" while leaving values in English,
   because the gate they were given only compared key names. They were not
   wrong, the gate was.
2. **Break a new check once before trusting it.** Every guard here was
   mutation-tested, and `scripts/copy-guards.test.mjs` keeps that honest. A
   broken checker reports success forever, which is worse than no checker: the
   green tick stops anyone from looking.
