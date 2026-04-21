import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST with multipart/form-data." }, 405);
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") ?? formData.get("pdf");

    if (!(file instanceof File)) {
      return jsonResponse(
        { error: "Nenhum arquivo enviado. Envie o PDF no campo 'file' (multipart/form-data)." },
        400,
      );
    }

    const buffer = new Uint8Array(await file.arrayBuffer());

    const pdf = await getDocumentProxy(buffer);
    const result = await extractText(pdf, { mergePages: false });

    const pages: string[] = Array.isArray(result.text) ? result.text : [String(result.text ?? "")];
    const totalPages: number = result.totalPages ?? pages.length;

    const charsPerPage = pages.map((p) => p.length);
    const fullText = pages.join("\n");
    const sampleText = fullText.slice(0, 2000);
    const totalChars = charsPerPage.reduce((sum, n) => sum + n, 0);
    const avgCharsPerPage = totalPages > 0 ? totalChars / totalPages : 0;
    const isReadable = avgCharsPerPage > 100;

    return jsonResponse({
      total_pages: totalPages,
      sample_text: sampleText,
      chars_per_page: charsPerPage,
      is_readable: isReadable,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return jsonResponse({ error: `Falha ao processar PDF: ${message}`, stack }, 500);
  }
});
