import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import pdfParse from "https://esm.sh/pdf-parse@1.1.1";

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

    const charsPerPage: number[] = [];
    const data = await pdfParse(buffer, {
      pagerender: async (pageData: {
        getTextContent: (opts: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{
          items: Array<{ str: string }>;
        }>;
      }) => {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });
        const pageText = textContent.items.map((item) => item.str).join(" ");
        charsPerPage.push(pageText.length);
        return pageText;
      },
    });

    const totalPages: number = data.numpages ?? 0;
    const fullText: string = data.text ?? "";
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
    return jsonResponse({ error: `Falha ao processar PDF: ${message}` }, 500);
  }
});
