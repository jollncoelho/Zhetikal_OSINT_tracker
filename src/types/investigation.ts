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
  /** Every visible text line extracted from the page, in reading order. */
  text?: string[];
  /** The extracted text joined with newlines (convenience copy). */
  textContent?: string;
  /** Image / media asset URLs discovered on the page. */
  assets?: string[];
  /** Response size in bytes. */
  bytes?: number;
  /** Server-side capture duration in milliseconds. */
  elapsedMs?: number;
  /** True when the document exceeded the capture buffer limit. */
  truncated?: boolean;
  /** Redirect chain observed while fetching. */
  redirects?: string[];
  /** ISO timestamp of the server-side capture. */
  capturedAt?: string;
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
  /** Every visible text line extracted from the captured page. */
  extracted_text?: string[];
  /** Image / media assets discovered on the captured page. */
  extracted_assets?: string[];
  notes: string;
  created_at: string;
}

