export type EvidenceArtifactType = 'screenshot' | 'downloaded_page' | 'extracted_link' | 'text_note';

export interface InvestigationCase {
  id: string;
  case_name: string;
  investigating_officer: string;
  agency: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MetadataResponse {
  finalUrl: string;
  title: string;
  status: number;
  contentType: string;
  html: string;
  meta: Record<string, string>;
  links: string[];
  screenshotDataUrl: string;
}

export interface EvidenceArtifact {
  id: string;
  case_id: string;
  artifact_type: EvidenceArtifactType;
  target_url: string;
  final_url: string;
  title: string;
  http_status: number | null;
  content_type: string;
  raw_html: string;
  sha512: string;
  captured_at: string;
  browser_metadata: Record<string, string | number>;
  meta?: Record<string, string>;
  screenshot_preview: string;
  screenshot_previews?: string[];
  extracted_links: string[];
  notes: string;
  created_at: string;
}

