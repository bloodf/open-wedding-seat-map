# Wedding Seat Map

Wedding Seat Map is an open-source editor for wedding seating plans, guest assignments, and venue floorplans. It is built as a Vite React app with offline-first PWA support and Supabase collaboration groundwork.

## Project Status

This is a greenfield app. Core editor work may land in parallel with the docs, CI, and smoke-test surface described here. Until the editor shell is complete, e2e tests document the stable labels and `data-testid` hooks the core app should expose.

## License

Wedding Seat Map is licensed under the GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).

## Local Development

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- Optional: Supabase project for testing the planned collaboration backend

Setup:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Common commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run preview
npm run e2e
```

The dev server defaults to Vite. The preview server is used by Playwright through `playwright.config.ts`.

## Environment Variables

Create `.env.local` from `.env.example`.

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Optional | Supabase project URL for backend groundwork testing. Leave empty for local-only mode. |
| `VITE_SUPABASE_ANON_KEY` | Optional | Supabase anon or publishable key for browser-side Supabase access. Do not use a service role key in the client. |

Any variable prefixed with `VITE_` is exposed to browser code. Keep private keys, service role keys, and operational secrets out of Vite env files.

## Supabase Setup

Supabase is optional. The current app runtime works locally with browser storage and import/export. Remote sharing and persistence are not enabled end-to-end yet.

Recommended setup:

1. Create a Supabase project.
2. Copy the project URL and publishable key into `.env.local`.
3. Apply `supabase/migrations/0001_collaboration.sql`.
4. Keep row level security enabled for maps, sessions, updates, and share-link tables.
5. Use a separate local or preview Supabase project for development and CI.

See [docs/setup-supabase.md](docs/setup-supabase.md) for the current migration, RPCs, RLS notes, and limitations.

## Vercel Deploy

1. Import the repository in Vercel.
2. Set the framework preset to Vite.
3. Use `npm run build` as the build command.
4. Use `dist` as the output directory.
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only when testing Supabase groundwork.

Preview deploys should not point at production Supabase data unless access policies are explicitly ready for that environment.

## Privacy Model Caveats

Wedding seating data can include guest names, notes, accessibility needs, and relationship metadata. Treat it as personal event data.

- Local-only mode keeps maps in the browser unless the user exports a file.
- The current runtime does not persist maps to Supabase. Future Supabase mode will send map and guest data to the configured project.
- Exports can contain all guest names, notes, table assignments, incompatibility rules, and venue geometry.
- Deleted guest data may still exist in exported files, browser backups, Supabase backups, or shared copies.
- Client-side env vars are public. Never place service role keys or private credentials in `VITE_` variables.

See [docs/privacy.md](docs/privacy.md) for a fuller checklist.

## Import And Export

Planned import behavior:

- CSV guest imports add guests, groups, and optional assignments.
- JSON imports restore a full Wedding Seat Map scene.
- SVG imports should either become an editable scene when metadata is present or a locked venue background when it is plain SVG.

Planned export behavior:

- JSON is the round-trip format for backup and re-import.
- CSV is for guest and assignment interchange.
- SVG is for editable/vector venue sharing where supported.
- PDF is for print and vendor handoff.

Importers should validate foreign data before it reaches the editor state. Exported files should not include Supabase service credentials or internal access tokens.

## PWA Notes

The app ships a web app manifest and SVG placeholder icons under `public/`. Binary icon generation is intentionally deferred. Before production, generate platform-specific PNG icons from the SVG source and verify install behavior on desktop Chrome, Android Chrome, and iOS Safari.

The service worker should cache only safe app-shell assets and should not cache authenticated Supabase responses unless the privacy and stale-data behavior are explicitly designed.

## Testing

Unit and domain tests run with Vitest. Browser smoke tests run with Playwright.

```bash
npm run test
npm run e2e
```

Playwright smoke coverage is documented in [docs/testing.md](docs/testing.md), including the stable roles and `data-testid` selectors expected from the editor UI.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, test expectations, and contribution guidelines.
