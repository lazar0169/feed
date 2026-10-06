# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two-part repo:
- `client/` — Angular 21 PWA. **All frontend work happens here; run every `npm` command from `client/`.**
- `supabase/` — database migrations, `config.toml`, `seed.sql`, and edge functions

## Commands

```bash
npm start          # dev server at http://localhost:4200
npm run local      # dev server on 0.0.0.0 (reach it from a phone on the same LAN — the app is mobile-first)
npm run build      # production build → client/dist/baby-feeding-app/browser
npm test           # Vitest via `ng test` (@angular/build:unit-test); watches by default
npx ng test --watch=false                          # single run
npx ng test --watch=false --include='**/foo.spec.ts'  # one spec file
npm run deploy     # prod build + force-push to `public` branch (CI runs this; rarely run by hand)
```

No lint script. Tests run under **Vitest** (not Karma/Jasmine) and currently only `app.spec.ts` exists. Prettier config is in `package.json` (`printWidth: 100`, `singleQuote: true`).

Database (from repo root, needs the Supabase CLI): `supabase start`, `supabase db reset` (re-applies all migrations + `seed.sql` locally), `supabase migration new <name>`, `supabase db push` (applies to the remote project).

## Deployment

Pushing to `master` triggers `.github/workflows/deploy.yml` → `npm run deploy`, which builds and force-pushes the compiled app to the `public` branch. GitHub Pages serves `public`. **master is production; there is no staging.**

## Architecture

Angular 21, fully standalone (no NgModules), signal-first. Backend is **Supabase accessed directly from the browser** — there is no custom API server, so Row Level Security is the only server-side security boundary and nearly every query filters by `user_id`.

### Service layer (all `providedIn: 'root'` singletons)

The services form a reactive chain driven by auth signals:

- **`AuthService`** owns the one `SupabaseClient` (created from `environment.supabase`). Everything else reaches Supabase via `authService.getSupabaseClient()` — do not create additional clients. It exposes `currentUser` / `currentProfile` / `isAuthenticated` signals kept in sync by Supabase's `onAuthStateChange`. **Login is by username, not email**: `signIn()` looks up the email from `profiles` (case-insensitive `ilike`), then does email/password auth; `signUp()` creates both the auth user and the `profiles` row.
- **`FeedingService`** holds entries in an RxJS `BehaviorSubject` exposed as `entries$`, plus an `isLoading` signal. **`entries$` only holds the last 90 days** (`RECENT_WINDOW_DAYS`, filtered on `timestamp`) to keep startup bounded; everything that reads `getAllEntries()`/`entries$` — Today, notifications — sees only that window. Older history is fetched on demand by `loadOlderEntries(offset, pageSize)` (strictly `< windowStart`, so no overlap) and is deliberately *not* merged into `entries$`; the Log page keeps its own paginated store for it. An `effect()` on `authService.currentUser()` reloads on login and clears on logout. All CRUD writes to Supabase then **optimistically mutates the local `BehaviorSubject`** rather than refetching.
- **`SettingsService`** stores per-user `user_settings` (feeding interval + notifications toggle) in a signal, lazily creating a default row (3h interval) on first load via the `PGRST116` "no rows" path. Same auth-`effect()` load pattern as FeedingService.
- **`SleepService`** — same auth-`effect()` load + optimistic-write pattern, but **signal-only** (`sessions` signal, no BehaviorSubject) and a 30-day window (plus any never-stopped session). `activeSession` is the row with `endAt === null` (the live timer); `findOverlap()` is checked client-side before every write since the DB doesn't enforce non-overlap. Day helpers (`getSessionsForDay`, `getDaySummary`) clip sessions to local-midnight boundaries because sleep crosses midnight.
- **`NotificationService`** runs an `effect()` over user + settings + entries and schedules a browser `Notification` via `setTimeout` for the next feeding. Next-feed time = latest entry's `date`+`time` + interval. `getTimeUntilNextNotification()` returns a signed ms value (negative = overdue) and is the source of truth the Today page reads for its countdown UI.
- **`StorageService`** is a thin typed `localStorage` wrapper (not currently central to data flow).

`FeedingService` also exposes `entries`, a `toSignal` mirror of `entries$`. Today derives its state from it with `computed()`; Log subscribes to `entries$` with `takeUntilDestroyed`. Prefer signals/`computed()` for new code, and don't subscribe inside an `effect()`.

### Root shell (`app.ts` / `app.html`)

`App` owns the global loading overlay (hidden once auth + feeding + settings finish loading), the bottom nav (hidden on `/login` and `/reset-password` via a `showNavigation` computed), and the **service-worker update banner** — it watches `SwUpdate.versionUpdates` for `VERSION_READY`, checks every 6h, and reloads on user confirm.

### Routing & guard

Routes in `app.routes.ts`; protected routes (`today`, `log`, `sleep`, `settings`) use `authGuard` (`guards/auth.guard.ts`), which awaits a live Supabase session and redirects to `/login?returnUrl=…` otherwise. Unknown paths → `/login`, `''` → `/today`.

### Pages & shared components

- **`today`** — primary screen: add/edit/delete today's entries, running milk (ml) + solids (g/spoons) totals via `computed()`, and a live "next feed" countdown that recomputes every 60s and switches label/icon/CSS class between *next feed in* / *feeding time* (±10 min window) / *overdue*.
- **`log`** — history grouped by date with per-day totals; formats dates as Today/Yesterday/weekday.
- **`sleep`** — live asleep/awake card with a one-tap start/stop timer (nap vs. night guessed from the hour), per-day totals with a day navigator, and a session list showing the awake gap (wake window) between sessions. Manual add/edit goes through `components/sleep-form`, which may leave the end empty ("still asleep") only when no other session is in progress.
- **`settings`** — interval + notification toggles, permission request, test notification, logout.
- **`components/feeding-form`** — the one reactive form for both create and edit, milk and solid. Validators are swapped dynamically (`updateSolidValidators`): solids require `name` and either grams **or** spoons (mutually exclusive — picking spoons forces `amount` to 0). This is the trickiest client logic; read it before touching entry creation.
- **`components/feeding-list`** — renders entries; measures food-name chip overflow in `ngAfterViewChecked` and sets a `--marquee-offset` CSS var to scroll long names (the subject of several recent commits).

## Data model

`FeedingEntry` (`models/feeding-entry.model.ts`) is discriminated on `type: 'milk' | 'solid'`:
- **milk** → `amount` is ml.
- **solid** → `amount` is grams (0 when measured in spoons instead) plus optional `name` and `spoons`.

Entries with no `type` default to `'milk'` (`DEFAULT_FEEDING_TYPE` in `feeding.service.ts`) for backwards compatibility with rows created before the solids feature. `timestamp` is derived from `date`+`time` and used only for sorting. Solids were added by the `20260305*` migrations (`type`, `name`, `spoons` columns, all nullable/defaulted), so client code must tolerate their absence.

`SleepSession` (`models/sleep-session.model.ts`) maps the `sleep_sessions` table (`20261006000000` migration). Unlike feedings it stores real `timestamptz` columns (`start_at`, `end_at`; `end_at` NULL = in progress), surfaced to the client as epoch-ms `startAt`/`endAt`. `kind` is `'nap' | 'night'`. A partial unique index allows only one open session per user, so a failed `startSleep()` triggers a resync.

## Styling & PWA

- Mobile-first SCSS, "Refined Dark" design system. Design tokens are CSS custom properties in `src/styles.scss` — surfaces (`--bg-dark/medium/light/card/elevated`), text (`--text-dark/light/faint`), a single violet accent (`--accent`, `--accent-hover`, `--accent-soft`, `--accent-ring`), hairline borders (`--border-subtle/medium/strong`), radii (`--radius-sm/`/`--radius`/`--radius-lg`/`--radius-pill`), and restrained neutral shadows (`--shadow`/`-lg`/`-xl`). Always reuse these vars rather than hardcoding colors, and avoid decorative gradients/colored glows — the system is flat surfaces + hairlines. Legacy accent names (`--accent-lavender`, `--primary-color`, etc.) are kept but re-pointed to the violet system. Fonts: **Inter** (Google Fonts) and **Font Awesome 6.4.2**, loaded via CDN `<link>`s in `src/index.html` (icons are `<i class="fas fa-…">`).
- PWA: service worker registered in `app.config.ts` (disabled in dev), configured by `ngsw-config.json`; iOS/Android icons and meta tags live in `index.html` and `public/`. See `client/PWA-ICONS-GUIDE.md` for icon regeneration.

## Conventions

- Angular files drop the `.component`/`.service` suffix in places (`today.ts`, `login.ts`); follow the naming already in the directory you edit.
- Use the modern idioms already in use: standalone components, `inject()`, `signal()`/`computed()`/`effect()`, `takeUntilDestroyed`, and `@if`/`@for` control flow (never `*ngIf`/`*ngFor`).
- Schema changes go in `supabase/migrations/` as timestamped SQL; write them additively (`ADD COLUMN IF NOT EXISTS`, sane defaults) and keep RLS in mind since the browser hits Postgres directly.
- The Supabase URL and anon key are committed in `client/src/environments/environment.ts` — that's intentional (anon key is public; RLS is the security boundary).
