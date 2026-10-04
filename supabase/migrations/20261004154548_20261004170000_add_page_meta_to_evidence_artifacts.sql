/*
# Store captured page metadata on evidence artifacts

1. Modified Tables
- `evidence_artifacts`: adds `meta` (jsonb, default '{}') to retain page title and OpenGraph metadata returned when a URL is added.

2. Security
- No new access surface is introduced.
- The new column inherits the existing row-level security policies on `evidence_artifacts`.

3. Important Notes
- Existing evidence rows remain unchanged and receive an empty metadata object.
- This supports the URL creation flow without storing a second copy of the page content outside the evidence record.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'evidence_artifacts'
    AND column_name = 'meta'
  ) THEN
    ALTER TABLE public.evidence_artifacts
    ADD COLUMN meta jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;