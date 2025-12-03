# Supabase Edge Functions

This directory contains Supabase Edge Functions powered by Deno.

## Creating a New Function

```bash
supabase functions new your-function-name
```

## Serving Functions Locally

```bash
# Serve all functions
supabase functions serve

# Serve a specific function
supabase functions serve hello-world --no-verify-jwt
```

## Deploying Functions

```bash
# Deploy all functions
supabase functions deploy

# Deploy a specific function
supabase functions deploy hello-world
```

## Testing Functions

### Using curl

```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/hello-world' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"name":"Functions"}'
```

### From your Angular app

```typescript
const { data, error } = await supabase.functions.invoke('hello-world', {
  body: { name: 'Functions' }
})
```

## Environment Variables

To use environment variables in your functions:

1. Create a `.env` file in the `supabase/` directory (it's gitignored)
2. Add your variables:
   ```
   MY_SECRET_KEY=your-secret-value
   ```
3. Access them in your function:
   ```typescript
   const mySecret = Deno.env.get('MY_SECRET_KEY')
   ```

## Learn More

- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [Deno Documentation](https://deno.land/manual)
