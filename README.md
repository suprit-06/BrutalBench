# BRUTALBENCH

This repository contains the complete end-to-end architecture for the BRUTALBENCH AI Evaluation Pipeline. We use a **Monolithic Next.js Architecture** to ensure extremely easy deployment.

## Directory Structure

### `/frontend`
The core application. It handles both the client-side UI and the server-side AI evaluation logic.
- **Tech Stack**: Next.js App Router, Tailwind CSS (v4), TypeScript, Zustand, NextAuth, Google Gemini SDK.
- **Key Features**: Brutalist terminal design, GitHub OAuth token interception, seamless backend API route (`/api/evaluate`) for fetching repos and executing AI grading.

### `/supabase`
The database infrastructure configuration.
- **Tech Stack**: PostgreSQL (Supabase).
- **Key Features**: `squad_d_schema.sql` contains the exact tables and Row Level Security policies (denying all client inserts) for the `users` and `evaluations` tables.

## Getting Started

1. Set up your environment variables inside `frontend/.env.local` (Supabase, GitHub, Google Gemini).
2. Apply the SQL schema in `/supabase/sql/squad_d_schema.sql` to your Supabase instance.
3. Open a terminal and navigate to the frontend folder: `cd frontend`
4. Run the development server: `npm run dev`
5. Open `http://localhost:3000` in your browser and click "Authenticate via GitHub"!
