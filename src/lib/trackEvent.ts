import { supabase } from "@/integrations/supabase/client";

const DEDUP_KEY = "catedra_last_event";

interface LastEvent {
  name: string;
  ts: number;
}

/**
 * Envia evento para analytics_events com deduplicação simples.
 * Ignora evento se event_name + timestamp(arredondado 5s) = último evento.
 */
export async function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  userId?: string,
) {
  const roundedTs = Math.floor(Date.now() / 5000);

  try {
    const raw = sessionStorage.getItem(DEDUP_KEY);
    if (raw) {
      const last: LastEvent = JSON.parse(raw);
      if (last.name === eventName && last.ts === roundedTs) return;
    }
  } catch {
    // sessionStorage indisponível — segue sem dedup
  }

  try {
    sessionStorage.setItem(DEDUP_KEY, JSON.stringify({ name: eventName, ts: roundedTs }));
  } catch {
    // ignore
  }

  await supabase.from("analytics_events").insert({
    user_id: userId || null,
    event_name: eventName,
    properties,
  } as any);
}
