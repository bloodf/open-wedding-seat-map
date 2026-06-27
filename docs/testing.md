# Testing Plan

This document defines the Slice D browser-smoke contract for the editor. The app shell may land in parallel, so the Playwright specs intentionally target stable accessible labels and `data-testid` hooks that the core implementation should expose.

## Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e
```

CI runs lint, typecheck, unit tests, and build by default. E2e is optional in CI until the editor shell is ready.

## Stable Selector Contract

| Surface | Required selector | Accessibility expectation |
| --- | --- | --- |
| Editor shell | `data-testid="seat-map-editor"` | `main` landmark named `Wedding Seat Map editor` |
| Toolbar | `data-testid="editor-toolbar"` | `toolbar` named `Editor tools` |
| New map action | `data-testid="new-map-button"` | Button named `New map` or `New seating map` |
| Canvas | `data-testid="seat-map-canvas"` | Named drawing/editor region |
| Table object | `data-testid^="seat-map-object-table-"` | Visible after creating or importing a map |
| CSV import input | `data-testid="guest-csv-input"` | File input with label that mentions CSV guests |
| JSON import input | `data-testid="scene-json-input"` | File input with label that mentions JSON scene |
| Guest list | `data-testid="guest-list"` | Region or list containing imported guest names |
| JSON export | `data-testid="export-json-button"` | Button named `Export JSON` |
| SVG export | `data-testid="export-svg-button"` | Button named `Export SVG` |
| PDF export | `data-testid="export-pdf-button"` | Button named `Export PDF` |

Keep selectors stable. If the UI changes them, update this file and the Playwright specs in the same change.

## Smoke Coverage

The Playwright suite under `tests/e2e` covers:

- Editor creation and initial map rendering
- CSV guest import
- JSON scene import
- JSON and SVG download smoke
- PDF download smoke
- Mobile viewport reachability
- Basic accessibility checks for landmarks and unnamed controls

The suite does not currently run axe because no axe dependency is installed. If `@axe-core/playwright` is added later, add automated WCAG checks to the accessibility smoke test.

## Fixtures

Fixtures live under `tests/fixtures`:

- `guests.csv` - minimal guest import file with groups and notes
- `sample-scene.json` - full scene import fixture for JSON round-trip smoke

Fixtures should stay small and free of real personal data.

## Manual PWA Checks

Before production release:

1. Run `npm run build` and `npm run preview`.
2. Open the preview URL in Chrome.
3. Confirm the manifest loads without console errors.
4. Confirm install prompt eligibility where supported.
5. Go offline and reload an already visited page.
6. Confirm no authenticated Supabase response is cached by the service worker.
