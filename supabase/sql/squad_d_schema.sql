-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Drop existing tables to ensure clean schema recreation
DROP TABLE IF EXISTS public.evaluations CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Core Users Table
CREATE TABLE public.users (
    id TEXT NOT NULL PRIMARY KEY,
    github_handle TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    access_token TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evaluations Table
CREATE TABLE public.evaluations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    score INTEGER CHECK (score >= 0 AND score <= 100) NOT NULL,
    critique TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- B-Tree Index for rapid Leaderboard sorting
CREATE INDEX idx_evaluations_score ON public.evaluations(score DESC);

-- Turn on the firewall
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read profiles for the leaderboard
CREATE POLICY "Public profiles are viewable by everyone." 
ON public.users FOR SELECT USING (true);

-- Allow NextAuth/Supabase Adapter to UPSERT the user upon login
CREATE POLICY "Users can insert their own profile." 
ON public.users FOR INSERT WITH CHECK (auth.uid()::text = id);

CREATE POLICY "Users can update own profile." 
ON public.users FOR UPDATE USING (auth.uid()::text = id);

-- Allow anyone to view the evaluations for the dashboard/leaderboard
CREATE POLICY "Evaluations are viewable by everyone." 
ON public.evaluations FOR SELECT USING (true);

-- Enable Realtime broadcast for insertions to the evaluations table
ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluations;
