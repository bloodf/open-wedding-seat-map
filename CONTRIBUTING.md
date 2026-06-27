# Contributing

Thanks for helping build Wedding Seat Map. This project is AGPL-3.0-or-later and accepts contributions that keep the editor useful, private by default, and testable.

## Development Setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Use Node.js 22 or newer. Keep `.env.local` uncommitted.

## Quality Gates

Run these before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Run Playwright when the change affects the editor shell, import/export, PDF output, PWA behavior, or responsive layout:

```bash
npm run e2e
```

The CI workflow runs lint, typecheck, unit tests, and build by default. E2e is opt-in in CI until the app shell is stable.

## Test Surface

The editor should expose stable accessible names and `data-testid` hooks for smoke tests. Keep these selectors stable unless the test docs and tests are updated in the same change:

- `seat-map-editor`
- `editor-toolbar`
- `new-map-button`
- `seat-map-canvas`
- `guest-csv-input`
- `scene-json-input`
- `export-json-button`
- `export-svg-button`
- `export-pdf-button`

See [docs/testing.md](docs/testing.md) for the full selector contract.

## Privacy And Data Handling

Guest lists can include personal data. Contributions should follow these rules:

- Do not log guest names, notes, access needs, or share tokens in production code.
- Do not store Supabase service role keys in client code or Vite env vars.
- Keep local-only mode functional when Supabase env vars are empty.
- Validate imported files before mutating editor state.
- Make export behavior explicit in UI copy when a file contains all guest data.

## Pull Request Checklist

- Scope is focused and avoids unrelated refactors.
- Docs are updated when behavior, setup, env vars, import/export formats, or selectors change.
- Tests cover new behavior or document why runtime coverage is not feasible yet.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` have been run locally.
- PWA changes are checked against the manifest and service worker cache list.

## License Expectations

By contributing, you agree that your contribution is provided under AGPL-3.0-or-later. Do not add code, assets, or fixtures with incompatible licenses.
