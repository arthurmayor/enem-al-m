import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ParsedPage {
  page_number: number;
  text: string;
}

export interface PreParserResult {
  pages: ParsedPage[];
  total_pages: number;
  total_chars: number;
}

// Splits "bucket/path/to/file.pdf" → { bucket, path }. If only a single
// segment is provided, defaults the bucket to "exam-files".
function splitStoragePath(storagePath: string): { bucket: string; path: string } {
  const trimmed = storagePath.replace(/^\/+/, "");
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return { bucket: "exam-files", path: trimmed };
  }
  return { bucket: trimmed.slice(0, slash), path: trimmed.slice(slash + 1) };
}

export async function runPreParser(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<PreParserResult> {
  const { bucket, path } = splitStoragePath(storagePath);

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(
      `Falha ao baixar PDF de storage://${bucket}/${path}: ${error?.message ?? "unknown"}`,
    );
  }

  const buffer = new Uint8Array(await data.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const result = await extractText(pdf, { mergePages: false });

  const rawPages: string[] = Array.isArray(result.text)
    ? result.text
    : [String(result.text ?? "")];

  const pages: ParsedPage[] = rawPages.map((text, i) => ({
    page_number: i + 1,
    text: text ?? "",
  }));

  const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);

  return {
    pages,
    total_pages: result.totalPages ?? pages.length,
    total_chars: totalChars,
  };
}
