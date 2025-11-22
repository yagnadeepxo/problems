## Overview

This app hits four Hacker News RSS feeds, stores the combined payload in an OS-level temp file, and runs two Gemini passes:

1. **First round (Gemini 2.5 Flash)** – filters for real workflow/problem pain.
2. **Second round (Gemini 2.5 Pro)** – scores venture-scale potential across B2B SaaS & consumer dimensions.

A single API endpoint (`/api/hn`) orchestrates the entire pipeline. A Vercel cron pings `/api/hn?refresh=true` every day at **00:00 UTC**. The final evaluation results are stored in Supabase, and the homepage displays evaluations grouped by day. Click on any day to view the full report.

## Local Development

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the dashboard. Use the “Force refresh now” button or hit `/api/hn?refresh=true` to run the full pipeline manually.

## Gemini Configuration

Set the Gemini API key in your environment before running the app:

```bash
export GEMINI_API_KEY=your-key-here
```

If `GEMINI_API_KEY` is not defined, the app falls back to the key provided in the specification, but you should prefer a private environment variable for production use.

## Supabase Configuration

Set your Supabase credentials in your environment:

```bash
export NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
export NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

The app stores final evaluation results in the `hn_evaluations` table. Make sure you've created the table using the SQL provided in the setup instructions.

## Cron Scheduling

`vercel.json` contains a single cron definition:

```json
{
  "crons": [
    {
      "path": "/api/hn?refresh=true",
      "schedule": "0 0 * * *"
    }
  ]
}
```

Deploying to Vercel enables the automated daily refresh. For other hosts, schedule an equivalent task that hits the same endpoint once per day at midnight UTC.
