# Privacy Notes

Wedding Seat Map handles event data that can become personal data when it includes guest names, notes, access needs, family groups, relationship constraints, and table assignments.

## Local-Only Mode

When Supabase env vars are empty, the app should remain usable with browser-local storage and file import/export.

Local-only caveats:

- Browser storage is not a secure vault.
- Anyone with access to the browser profile may be able to read saved maps.
- Clearing site data can delete unsynced maps.
- Exported files become the user's responsibility.

## Planned Supabase Mode

The current runtime does not persist maps to Supabase. When remote persistence is enabled in a future slice, project data will be sent to the configured Supabase project.

Implementation expectations:

- Enable row level security on all user data tables.
- Store only the data needed for the editor and collaboration features.
- Keep service role keys on trusted servers only.
- Treat share links and collaboration tokens as secrets.
- Document retention and deletion behavior before production use.

## Exports

Exports can contain complete event data. JSON round-trip exports are expected to be the most complete format. PDF, SVG, and CSV exports can still reveal guest names, assignments, notes, and venue details.

Before production, export UI should make it clear when a file includes personal data.

## Logging

Production logs should avoid:

- Guest names and notes
- Accessibility needs
- Relationship or incompatibility metadata
- Supabase access tokens
- Share tokens and invite links
- Full imported file contents

Use aggregate counts, anonymous object IDs, and high-level failure reasons instead.
