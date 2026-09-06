# ADR-0011: Recipe-card OCR runs in the browser

- **Status:** Accepted
- **Date:** 2026-09-06
- **Issue:** [#374](https://github.com/jrmoulckers/jrm-recipes/issues/374)
- **Depends on:** [ADR-0010](./0010-original-recipe-images.md)

## Context

People with handwritten recipe cards need a faster starting point than typing every ingredient and
step. Handwriting recognition is imperfect, especially for cursive, faded ink, unusual layouts, and
mixed languages. Recipe cards can also contain names, addresses, family notes, and other personal
information.

The source-image contract in ADR-0010 preserves original cards through the existing media library.
OCR has a different job: turn one selected photo into editable, unsaved editor fields. Coupling those
jobs would either upload a card merely to read it or create a second image-ownership model.

## Decision

### Recognition is local and provider-neutral

The browser runs Tesseract.js with pinned, same-origin worker, WebAssembly, and language assets.
English, Spanish, German, and Arabic models match the product's supported locales. The selected image
does not cross the network for OCR, and no external OCR or generative-AI provider is configured.

Build and development commands copy the pinned runtime assets from npm packages into the ignored
`public/ocr/` directory. The application loads Tesseract only after the user starts a scan, keeping
it out of the editor's initial route bundle. The content security policy permits first-party
WebAssembly compilation with `wasm-unsafe-eval`; JavaScript `unsafe-eval` remains disabled in
production.

Adding server or third-party OCR, generative structuring, provider credentials, or image transfer is
a new architecture and privacy decision. It requires explicit product approval and an updated
processor/data-retention review before implementation.

### Parsing remains deterministic

After recognition, the existing authenticated text-import action applies deterministic heading and
line heuristics. It does not call AI or an external service and does not persist the transcript.
Localized ingredient and step headings are supported for the four OCR languages. Unknown structures
remain editable text rather than being inferred.

The first-party server receives the recognized transcript for parsing under the same contract as the
existing paste-text import. Neither the transcript nor OCR confidence is stored. Applying the result
does enable the editor's existing device-local draft recovery.

### Review and save are separate decisions

The user explicitly chooses a photo and starts recognition. The UI then shows the transcript,
describes recognition confidence in plain language, and requires a second action to apply the
structured draft. Applying a scan never saves a recipe. The existing Save action is the only server
recipe mutation.

If applying would replace ingredient or step rows that already contain content, the editor asks for
confirmation. The selected photo and transcript are discarded from the scan UI after a successful
apply. Keeping the original card is a separate, explicit action through ADR-0010's Original recipe
images controls.

### Limits and failure behavior

- One recognition job runs at a time and can be cancelled.
- Input is limited to JPEG, PNG, or WebP files smaller than 10 MB.
- Existing authenticated import rate limits cover deterministic parsing requests.
- Empty, blurry, or unsupported images produce a plain-language recovery message.
- There is no automatic provider fallback. The user can retry with a clearer photo, correct the
  transcript, paste text, or type directly in the editor.

## Consequences

- OCR provider cost is zero; the trade-off is browser CPU, memory, and an approximately 12 MB
  on-demand download across the worker, core, and selected language model.
- Recognition can work after the same-origin OCR assets are available, without transmitting image
  content to a processor.
- Handwriting quality varies and is not represented as authoritative data. Review messaging, editable
  output, and explicit Save remain required.
- Supporting another language requires adding its pinned model, localized label and parser headings,
  then rechecking download size and mobile performance.
