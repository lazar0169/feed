# Feed - Baby Feeding Tracker

This project consists of:
- **client/** - Angular application for baby feeding tracking
- **supabase/** - Backend infrastructure with edge functions and database

## Supabase Setup

### Prerequisites

Install the Supabase CLI:

```bash
# macOS
brew install supabase/tap/supabase

# Windows (via Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
brew install supabase/tap/supabase
```

### Local Development

1. **Start Supabase locally:**

```bash
supabase start
```

This will start all Supabase services (Database, API, Storage, Auth, etc.) in Docker containers.

2. **Access Supabase Studio:**

Once started, access the local Supabase Studio at `http://localhost:54323`

3. **Get your local credentials:**

```bash
supabase status
```

This will show you:
- API URL
- Anon Key
- Service Role Key
- Database URL

### Linking to Remote Project

If you already have a Supabase project:

```bash
supabase link --project-ref your-project-ref
```

You can find your project ref in your Supabase dashboard URL: `https://app.supabase.com/project/[your-project-ref]`

### Database Migrations

```bash
# Create a new migration
supabase migration new migration_name

# Apply migrations locally
supabase db reset

# Push migrations to remote
supabase db push
```

### Edge Functions

```bash
# Create a new function
supabase functions new function-name

# Serve functions locally
supabase functions serve

# Deploy functions
supabase functions deploy function-name
```

### Environment Variables

1. Copy the example environment file:

```bash
cp supabase/.env.example supabase/.env
```

2. Fill in your Supabase credentials from the dashboard

### Stopping Supabase

```bash
supabase stop
```

## Project Structure

```
.
├── client/                  # Angular app (ignored by Supabase)
│   └── ...
├── supabase/
│   ├── functions/           # Edge Functions
│   │   ├── hello-world/     # Example function
│   │   └── README.md
│   ├── migrations/          # Database migrations
│   │   └── 20231203000000_initial_schema.sql
│   ├── config.toml          # Supabase configuration
│   ├── seed.sql             # Seed data for development
│   └── .env.example         # Environment variables template
└── README.md
```

## Next Steps

1. Link your Supabase project: `supabase link --project-ref your-project-ref`
2. Set up your environment variables in `supabase/.env`
3. Create your database schema in `supabase/migrations/`
4. Build your edge functions in `supabase/functions/`
5. Update your Angular app to connect to Supabase

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Database Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
