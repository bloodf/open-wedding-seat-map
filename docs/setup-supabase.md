# Supabase Setup

Supabase is optional. The current app runtime is local-first: maps are stored in
browser storage and file exports, and the Share button creates a local/offline
URL only. The Supabase files in this repository are backend groundwork for a
future remote collaboration flow.

## Environment

Add these values to `.env.local` only when testing Supabase groundwork:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Never expose a service role key in a Vite env var.

## Migration

Apply the current collaboration schema from:

```bash
supabase/migrations/0001_collaboration.sql
```

The migration creates:

- `public.maps` for encrypted map documents owned by authenticated users.
- `public.map_links` for anonymous capability links that store token hashes only.
- `public.map_sessions` for scoped anonymous or authenticated sessions.
- `public.map_updates` for append-only encrypted collaboration updates.
- RLS policies for authenticated map owners.
- RPCs granted to `anon` and `authenticated`:
  - `authorize_map_link(uuid, text, text, text)`
  - `append_map_update_via_session(uuid, jsonb)`
  - `list_map_updates_via_session(uuid, bigint)`

## Share Link And RLS Requirements

Anonymous link access must go through the RPC boundary. Do not allow browser
clients to select raw rows from `map_links`, and never expose `token_hash`
outside trusted database functions or server code.

Before enabling remote sharing in the app:

1. Create an owned `maps` row before issuing a link.
2. Generate a random capability token in the client or a server function.
3. Store only the SHA-256 token hash in `map_links`.
4. Send raw tokens only in URLs, and keep document keys in URL fragments.
5. Call `authorize_map_link` to create a scoped `map_sessions` row.
6. Use `append_map_update_via_session` and `list_map_updates_via_session` for encrypted updates.
7. Add and test Realtime authorization for private `map:<map_id>` channels before broadcasting updates.

## Current Limitations

- The runtime Share UI does not create `maps`, `map_links`, or `map_sessions`.
- Scene IDs in local documents are local IDs, not Supabase UUID map IDs.
- Remote persistence, remote anonymous links, and live collaboration are not enabled end-to-end.
- Supabase Realtime authorization policies for private channels still need to be completed and tested.
- Production readiness requires tests for anonymous, authenticated, owner, collaborator, expired-link, and revoked-link access.

Use local-only mode for normal development unless you are working on the remote
collaboration backend.
