/*
# Add screenshot_previews column to evidence_artifacts

1. Modified Tables
- `evidence_artifacts`: adds `screenshot_previews` (jsonb, default '[]') to store multiple preview images per artifact.
  The TypeScript type already had this field but the database schema was missing it.

2. Security
- No changes to existing RLS policies. The column inherits the table's existing access rules.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'evidence_artifacts'
    AND column_name = 'screenshot_previews'
  ) THEN
    ALTER TABLE public.evidence_artifacts
    ADD COLUMN screenshot_previews jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
