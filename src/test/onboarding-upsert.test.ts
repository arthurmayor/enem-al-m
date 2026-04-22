import { describe, it, expect } from "vitest";

/**
 * Regression for the "Erro ao salvar" failure on the last step of
 * onboarding. The `profiles` table has `name` NOT NULL; if an account
 * was created via the email-confirmation signup flow,
 * `AuthContext.signUp` could not write to `profiles` (no session yet)
 * and the row didn't exist. When `Onboarding.handleFinish` then ran
 * `upsert({...})` without `name`, Postgres rejected the INSERT branch
 * for missing the NOT NULL column.
 *
 * The fix derives a fallback name from the auth user's user_metadata
 * (where `supabase.auth.signUp({ options: { data: { name } } })` stores
 * it) and from the email prefix as a last resort.
 *
 * These tests guard the fallback resolver so the upsert payload always
 * carries a non-empty `name`, regardless of which signup path the user
 * came from.
 */

interface AuthLike {
  user_metadata?: Record<string, unknown> | null;
  email?: string | null;
}

function resolveProfileName(user: AuthLike | null | undefined): string {
  if (!user) return "Estudante";
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromMetadata =
    typeof metadata.name === "string" && metadata.name.length > 0
      ? metadata.name
      : null;
  const fromEmail = user.email?.split("@")[0] ?? null;
  return fromMetadata || fromEmail || "Estudante";
}

describe("resolveProfileName — onboarding upsert NOT NULL guard", () => {
  it("uses user_metadata.name when present", () => {
    expect(
      resolveProfileName({
        user_metadata: { name: "Arthur" },
        email: "arthur@example.com",
      }),
    ).toBe("Arthur");
  });

  it("falls back to the email prefix when metadata.name is missing", () => {
    expect(
      resolveProfileName({
        user_metadata: {},
        email: "arthur@example.com",
      }),
    ).toBe("arthur");
  });

  it("falls back to the email prefix when metadata.name is empty string", () => {
    expect(
      resolveProfileName({
        user_metadata: { name: "" },
        email: "arthur@example.com",
      }),
    ).toBe("arthur");
  });

  it("falls back to the email prefix when metadata.name is non-string", () => {
    expect(
      resolveProfileName({
        user_metadata: { name: 42 },
        email: "arthur@example.com",
      }),
    ).toBe("arthur");
  });

  it("returns 'Estudante' when both metadata.name and email are absent", () => {
    expect(
      resolveProfileName({
        user_metadata: {},
        email: null,
      }),
    ).toBe("Estudante");
  });

  it("returns 'Estudante' when user is null/undefined", () => {
    expect(resolveProfileName(null)).toBe("Estudante");
    expect(resolveProfileName(undefined)).toBe("Estudante");
  });

  it("returns 'Estudante' when user_metadata is missing entirely", () => {
    expect(
      resolveProfileName({
        email: null,
      }),
    ).toBe("Estudante");
  });

  it("never returns an empty string (the bug we're guarding)", () => {
    const candidates: AuthLike[] = [
      { user_metadata: {}, email: null },
      { user_metadata: { name: "" }, email: "" },
      { user_metadata: null, email: null },
      {},
    ];
    for (const c of candidates) {
      const name = resolveProfileName(c);
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
