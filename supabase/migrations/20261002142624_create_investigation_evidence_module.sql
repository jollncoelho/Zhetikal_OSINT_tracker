/*
# Create investigation cases and evidence artifacts

1. New Tables
- `investigation_cases`: shared investigation records with a case name, officer, agency, notes, and audit timestamps.
- `evidence_artifacts`: captured evidence linked to an investigation case, including target URL, artifact type, raw HTML, SHA-512 integrity hash, capture timestamp, browser metadata, screenshot preview data, extracted links, and notes.

2. Security
- Row Level Security is enabled on both tables.
- This application has no sign-in screen, so the single-tenant workspace intentionally permits anon and authenticated roles to create, read, update, and delete its investigation data.
- CRUD access is defined as four separate policies per table.

3. Important Notes
- Evidence records retain the original capture timestamp and cryptographic digest supplied by the capture workflow.
- Deleting an investigation case cascades to its evidence artifacts.
*/

CREATE TABLE IF NOT EXISTS public.investigation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_name text NOT NULL,
  investigating_officer text NOT NULL DEFAULT '',
  agency text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evidence_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.investigation_cases(id) ON DELETE CASCADE,
  artifact_type text NOT NULL CHECK (artifact_type IN ('screenshot', 'downloaded_page', 'extracted_link', 'text_note')),
  target_url text NOT NULL DEFAULT '',
  final_url text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  http_status integer,
  content_type text NOT NULL DEFAULT '',
  raw_html text NOT NULL DEFAULT '',
  sha512 text NOT NULL DEFAULT '',
  captured_at timestamptz NOT NULL DEFAULT now(),
  browser_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  screenshot_preview text NOT NULL DEFAULT '',
  extracted_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investigation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_artifacts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS investigation_cases_updated_at_idx ON public.investigation_cases(updated_at DESC);
CREATE INDEX IF NOT EXISTS evidence_artifacts_case_id_captured_at_idx ON public.evidence_artifacts(case_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS evidence_artifacts_target_url_idx ON public.evidence_artifacts(target_url);

DROP POLICY IF EXISTS "Shared investigation cases are readable" ON public.investigation_cases;
CREATE POLICY "Shared investigation cases are readable" ON public.investigation_cases FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Shared investigation cases are insertable" ON public.investigation_cases;
CREATE POLICY "Shared investigation cases are insertable" ON public.investigation_cases FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Shared investigation cases are editable" ON public.investigation_cases;
CREATE POLICY "Shared investigation cases are editable" ON public.investigation_cases FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Shared investigation cases are deletable" ON public.investigation_cases;
CREATE POLICY "Shared investigation cases are deletable" ON public.investigation_cases FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Shared evidence artifacts are readable" ON public.evidence_artifacts;
CREATE POLICY "Shared evidence artifacts are readable" ON public.evidence_artifacts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Shared evidence artifacts are insertable" ON public.evidence_artifacts;
CREATE POLICY "Shared evidence artifacts are insertable" ON public.evidence_artifacts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Shared evidence artifacts are editable" ON public.evidence_artifacts;
CREATE POLICY "Shared evidence artifacts are editable" ON public.evidence_artifacts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Shared evidence artifacts are deletable" ON public.evidence_artifacts;
CREATE POLICY "Shared evidence artifacts are deletable" ON public.evidence_artifacts FOR DELETE TO anon, authenticated USING (true);
