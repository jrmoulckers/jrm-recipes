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



