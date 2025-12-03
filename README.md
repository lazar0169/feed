# Baby Feeding Tracker

A modern, mobile-first Progressive Web App for tracking baby feeding sessions. Built with Angular 21 and Supabase.

## Features

- 📱 **Mobile-optimized** - iOS-style interface with sticky header and bottom navigation
- 📊 **Daily Statistics** - Track total feedings, amount, and average per feeding
- 📅 **Feeding Log** - View and manage feeding history
- 📈 **Statistics Dashboard** - Visualize feeding patterns over time
- 🔐 **User Authentication** - Secure username/password login with Supabase
- 🎨 **Dark Theme** - Easy on the eyes with lavender accents
- 🚀 **Auto-deployment** - Automatic GitHub Pages deployment on push to master

## Tech Stack

- **Frontend**: Angular 21 (standalone components, signals, modern control flow)
- **Backend**: Supabase (PostgreSQL, Auth, Row Level Security)
- **Deployment**: GitHub Actions → GitHub Pages
- **Styling**: SCSS with mobile-first approach

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd feed/client
npm install
```

### 2. Configure Supabase

Update `client/src/environments/environment.ts` with your Supabase credentials:

```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY'
  }
};
```

### 3. Set Up Database

Run the migrations in your Supabase SQL Editor:

```bash
# Apply the auth tables migration
cat supabase/migrations/20251203211500_add_auth_tables.sql

# Apply the RLS fix migration
cat supabase/migrations/20251203_fix_profiles_rls.sql
```

### 4. Run Development Server

```bash
cd client
npm start
```

Navigate to `http://localhost:4200/`

## Deployment

The app automatically deploys to GitHub Pages when you push to the `master` branch.

### Setup GitHub Pages

1. Go to your repository Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **public** / (root)
4. Save

### Deploy Process

```bash
# Make your changes
git add .
git commit -m "Your changes"
git push origin master
```

GitHub Actions will automatically:
1. Build the Angular app
2. Push the built files to the `public` branch
3. GitHub Pages serves from the `public` branch

## Database Schema

### `profiles` table
- `id` - UUID (references auth.users)
- `username` - TEXT (unique)
- `email` - TEXT (unique)
- `created_at` - TIMESTAMPTZ

### `feeding_entries` table
- `id` - UUID
- `user_id` - UUID (references auth.users)
- `date` - TEXT
- `time` - TEXT
- `amount` - INTEGER (ml)
- `comment` - TEXT
- `timestamp` - BIGINT
- `created_at` - TIMESTAMPTZ
- `updated_at` - TIMESTAMPTZ

## Development

### Angular CLI

```bash
# Generate a new component
ng generate component component-name

# Build for production
npm run build

# Run tests
npm test
```

### Supabase Local Development

Install the Supabase CLI:

```bash
# macOS
brew install supabase/tap/supabase
```

Start Supabase locally:

```bash
supabase start
supabase db reset  # Apply migrations
```

### Database Migrations

```bash
# Create a new migration
supabase migration new migration_name

# Apply migrations locally
supabase db reset

# Push migrations to remote
supabase db push
```

## Project Structure

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions deployment
├── client/                         # Angular 21 app
│   ├── src/
│   │   ├── app/
│   │   │   ├── guards/            # Auth guard
│   │   │   ├── pages/             # Page components
│   │   │   │   ├── today/         # Today's feedings
│   │   │   │   ├── log/           # Feeding log
│   │   │   │   ├── statistics/    # Stats dashboard
│   │   │   │   ├── login/         # Login/signup
│   │   │   │   └── reset-password/# Password reset
│   │   │   ├── services/          # Angular services
│   │   │   │   ├── auth.service.ts
│   │   │   │   └── feeding.service.ts
│   │   │   ├── app.ts             # Root component
│   │   │   ├── app.routes.ts      # Routing config
│   │   │   └── app.scss           # Global app styles
│   │   ├── environments/          # Environment configs
│   │   ├── styles.scss            # Global styles
│   │   └── main.ts
│   ├── angular.json
│   ├── package.json
│   └── tsconfig.json
├── supabase/
│   └── migrations/                 # Database migrations
│       ├── 20251203211500_add_auth_tables.sql
│       └── 20251203_fix_profiles_rls.sql
└── README.md
```

## Key Features Implementation

### Mobile-First Design
- Uses `100dvh` for proper iOS Safari viewport handling
- Sticky header with backdrop blur
- Fixed bottom navigation
- Scrollable content area only

### Modern Angular Patterns
- Standalone components (no NgModules)
- Signals for reactive state
- `@if`, `@for` control flow (no `*ngIf`, `*ngFor`)
- `inject()` for dependency injection
- `computed()` for derived state
- `effect()` for side effects

### Authentication Flow
1. User signs up with username, email, and password
2. Profile created in `profiles` table
3. Login uses username → email lookup → Supabase auth
4. Password reset via email link
5. Row Level Security ensures data isolation

## Resources

- [Angular Documentation](https://angular.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [Angular Signals Guide](https://angular.dev/guide/signals)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)
