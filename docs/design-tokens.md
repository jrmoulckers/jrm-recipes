# Design tokens

Heirloom's visual system is intentionally semantic. Components should ask for
roles like `bg-background`, `text-foreground`, `bg-primary`, `border-input`, and
`shadow-token`, not for one mode's literal color. The source of truth is
`src/styles/themes.css`, with the registry in `src/config/themes.ts` and Tailwind
bindings in `tailwind.config.ts`.

## The two theme axes

Heirloom has two orthogonal appearance axes:

1. **UI mode** is the visual personality. It is stored on `<html>` as
   `data-theme` and registered in `src/config/themes.ts`.
2. **Color scheme** is light, dark, or system. Dark mode is the `.dark` class on
   `<html>`; light mode is the absence of that class. `system` follows
   `prefers-color-scheme`.

The current UI modes are:

| Id             | Label        | Character                                                                 |
| -------------- | ------------ | ------------------------------------------------------------------------- |
| `kitchen`      | Kitchen      | Warm and cozy; creams, terracotta, home-baked charm. This is the default. |
| `whimsy`       | Whimsy       | Playful, colorful, bubbly.                                                |
| `professional` | Professional | Clean, editorial, quiet, confident.                                       |
| `kids`         | Kids         | Big, bright, friendly, with easier taps.                                  |
| `barebones`    | Simple       | Ultra-simple, high-contrast, minimal chrome.                              |

Defaults live in `src/config/themes.ts`:

- `DEFAULT_UI_THEME = "kitchen"`
- `DEFAULT_COLOR_SCHEME = "system"`

Accessibility preferences are a separate axis, not a replacement for UI mode or
scheme. `src/config/a11y.ts` stores text size, contrast, motion, and readable
type preferences in `heirloom-a11y`; `src/styles/a11y.css` reacts with
`data-text`, `data-contrast`, `data-motion`, and `data-reading` attributes.

## No-flash rendering

Theme state is rendered before the app hydrates:

- `src/app/layout.tsx` reads `THEME_COOKIE` (`heirloom-theme`) and
  `SCHEME_COOKIE` (`heirloom-scheme`) with `cookies()`, validates them with
  `isUITheme` / `isColorScheme`, and places `data-theme` on `<html>` for the
  server render. It also adds `.dark` when the saved scheme is explicitly
  `dark`; `system` is resolved by the inline script before paint.
- `src/components/theme/theme-script.tsx` runs a tiny inline script before first
  paint. It reads the same cookies, falls back to `localStorage`, applies
  `data-theme`, resolves `system` with `window.matchMedia`, and toggles `.dark`.
- `src/components/theme/theme-provider.tsx` keeps runtime changes in sync,
  persists them to both `localStorage` and cookies for one year, and exposes
  `useTheme()` / `useThemeBehavior()`.
- `THEME_PREVIOUS_COOKIE` (`heirloom-theme-prev`) remembers the mode active
  before Kids mode so turning Kids mode off can restore it.

## Semantic token layer

`src/styles/themes.css` stores colors as bare HSL channel triples, for example
`--primary: 18 60% 44%`. Tailwind wraps them as
`hsl(var(--primary) / <alpha-value>)` so utilities can still use opacity.

Token categories in `src/styles/themes.css`:

### Structure, type, elevation, and motion

- Shape: `--radius`
- Type families: `--font-display`, `--font-body`, `--font-mono`
- Elevation: `--shadow-sm`, `--shadow`, `--shadow-lg`
- Focus and sizing: `--ring-width`, `--text-scale`, `--tap-min`
- Motion: `--motion-scale`, `--duration-fast`, `--duration-base`,
  `--duration-slow`, `--ease-standard`, `--ease-emphasized`
- Interactive controls: `--control-scale`, `--control-min`

### Surfaces and text

- Page: `--background`, `--foreground`
- Raised/soft surfaces: `--surface`, `--surface-foreground`,
  `--surface-muted`
- Cards: `--card`, `--card-foreground`
- Popovers: `--popover`, `--popover-foreground`
- Muted areas: `--muted`, `--muted-foreground`
- Borders and focus: `--border`, `--input`, `--ring`

### Actions and states

- Brand/action: `--primary`, `--primary-foreground`
- Secondary action: `--secondary`, `--secondary-foreground`
- Accent: `--accent`, `--accent-foreground`
- Error: `--destructive`, `--destructive-foreground`
- Success: `--success`, `--success-foreground`
- Warning: `--warning`, `--warning-foreground`
- Info: `--info`, `--info-foreground`

`themes.css` starts with structural defaults on `:root` and global dark shadow
defaults on `.dark`. Kitchen is defined on both `:root` and
`[data-theme="kitchen"]`, then each other mode has a light block
(`[data-theme="…"]`) and a dark block (`[data-theme="…"].dark`).

## How Tailwind consumes tokens

`tailwind.config.ts` maps semantic utilities to CSS variables:

- Colors: `border`, `input`, `ring`, `background`, `foreground`, `surface`,
  `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`,
  `warning`, `info`, `card`, and `popover`
- Radius: `rounded-lg`, `rounded-md`, `rounded-sm`, `rounded-xl`, and
  `rounded-2xl` derive from `--radius`
- Fonts: `font-display`, `font-body`, and `font-mono` use the font tokens
- Type scale: `text-display`, `text-h1` through `text-h4`, `text-body-lg`,
  `text-body`, and `text-body-sm`
- Shadows: `shadow-token-sm`, `shadow-token`, and `shadow-token-lg`
- Focus width: `ring-2` resolves to `--ring-width`
- Motion: transition durations and easing utilities use the duration/ease tokens

`src/styles/globals.css` applies the tokens globally: the body uses
`bg-background font-body text-foreground`, headings use `font-display`, focus
outlines use `--ring` and `--ring-width`, and button-like controls get a minimum
hit target from `--tap-min`.

## Behavior flags

`THEME_BEHAVIOR` in `src/config/themes.ts` carries UX behavior beyond visuals.
The current values are:

| Mode           | `largeTargets` | `reduceMotion` | `simplifiedChrome` | `kidSafe` |
| -------------- | -------------- | -------------- | ------------------ | --------- |
| `kitchen`      | false          | false          | false              | false     |
| `whimsy`       | false          | false          | false              | false     |
| `professional` | false          | false          | false              | false     |
| `kids`         | true           | false          | true               | true      |
| `barebones`    | true           | true           | true               | false     |

What the flags mean in code:

- `largeTargets` marks modes that should use bigger touch targets. The token
  contract is enforced in `src/styles/themes.control-tokens.test.ts`: Kitchen,
  Whimsy, and Professional keep control tokens as no-ops; Kids and Simple raise
  `--control-scale`, `--control-min`, `--tap-min`, and `--ring-width`.
- `reduceMotion` marks modes that should avoid motion. In current code, Simple
  enforces this through `--motion-scale: 0`, the barebones rules in
  `src/styles/globals.css`, and the `data-theme="barebones"` check in
  `src/lib/use-reduced-motion.ts`.
- `simplifiedChrome` marks modes that should prefer less interface chrome. It is
  exposed through `useThemeBehavior()` for component opt-in; it is not a global
  CSS switch.
- `kidSafe` gates kid-friendly surfaces and copy. Examples include
  `src/config/kid-copy.ts`, `src/components/recipe/grown-up-controls.tsx`, and
  Cook Mode components that show safety prompts or larger controls.

## Contrast and accessibility guarantees

The theme tests parse the real CSS instead of a duplicate fixture:

- `src/styles/theme-contrast.test.ts` resolves every registered UI mode across
  light and dark. It requires text pairs such as `--foreground` on
  `--background`, `--surface-foreground` on `--surface`, state foregrounds on
  their fills, and muted foregrounds to meet **4.5:1**. It requires non-text
  pairs `--input` and `--ring` on `--background` to meet **3:1**.
- `src/styles/themes.contrast.test.ts` also checks filled controls, active nav
  text (`--primary` on `--background`), tooltip/popover pairs, and form borders
  across every theme and scheme.
- `src/styles/themes.control-tokens.test.ts` keeps interactive-control sizing
  aligned with `THEME_BEHAVIOR.largeTargets` and locks the current five
  `UI_THEME_IDS`.
- `src/config/a11y.ts` and `src/styles/a11y.css` add user preferences for larger
  text, high contrast, reduced motion, and readable type. Contrast and motion are
  tri-state: explicit on, explicit off, or unset to follow the operating system.
  `a11y.css` also handles `prefers-contrast: more` and
  `forced-colors: active`.

## Add a new UI mode

1. **Add the registry entry.** In `src/config/themes.ts`, add one `UI_THEMES`
   entry with an `id`, `label`, and `description`. Keep the id stable and
   lowercase because it becomes the `data-theme` value.
2. **Add behavior.** In the same file, add a `THEME_BEHAVIOR` entry for the new
   id with all four flags: `largeTargets`, `reduceMotion`,
   `simplifiedChrome`, and `kidSafe`. This is required because
   `THEME_BEHAVIOR` is typed as `Record<UITheme, …>`.
3. **Add tokens.** In `src/styles/themes.css`, add a light block
   `[data-theme="<id>"]` and a dark block `[data-theme="<id>"].dark`. Define
   every semantic color token in both blocks: `--background`, `--foreground`,
   `--surface`, `--surface-foreground`, `--surface-muted`, `--card`,
   `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`,
   `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`,
   `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`,
   `--destructive-foreground`, `--success`, `--success-foreground`,
   `--warning`, `--warning-foreground`, `--info`, `--info-foreground`,
   `--border`, `--input`, and `--ring`. If the mode needs a distinct type,
   radius, elevation, text scale, tap size, motion scale, or control sizing,
   define those structural tokens in the light block too.
4. **Satisfy contrast and control tests.** Run the existing Vitest coverage for
   `src/styles/theme-contrast.test.ts`, `src/styles/themes.contrast.test.ts`,
   and `src/styles/themes.control-tokens.test.ts`. A new mode must meet the
   4.5:1 text and 3:1 non-text thresholds in both light and dark.
5. **Check automatic vs. manual registry updates.** `UI_THEME_IDS` and the
   `UITheme` type are derived from `UI_THEMES`, so they update automatically.
   `ThemeSwitcher` and the landing `ModePicker` map over `UI_THEMES`, so picker
   entries are automatic. Manual work is still needed anywhere that hard-codes
   the current ids, including `ThemeScript`'s `themes` array and tests that lock
   the exact list of ids.

_Related issue: #106._
