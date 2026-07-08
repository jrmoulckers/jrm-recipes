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
