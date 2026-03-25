export const SUBJECT_COLORS: Record<string, string> = {
  "Português": "#7C3AED",
  "Matemática": "#2563EB",
  "História": "#C2410C",
  "Geografia": "#059669",
  "Biologia": "#0F766E",
  "Física": "#4338CA",
  "Química": "#DB2777",
  "Inglês": "#0891B2",
  "Filosofia": "#CA8A04",
};

export function getSubjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] || "#6B665E";
}

export function getSubjectBgClass(subject: string): string {
  const map: Record<string, string> = {
    "Português": "bg-mat-port/10 text-mat-port",
    "Matemática": "bg-mat-math/10 text-mat-math",
    "História": "bg-mat-hist/10 text-mat-hist",
    "Geografia": "bg-mat-geo/10 text-mat-geo",
    "Biologia": "bg-mat-bio/10 text-mat-bio",
    "Física": "bg-mat-fis/10 text-mat-fis",
    "Química": "bg-mat-quim/10 text-mat-quim",
    "Inglês": "bg-mat-ing/10 text-mat-ing",
    "Filosofia": "bg-mat-fil/10 text-mat-fil",
  };
  return map[subject] || "bg-gray-100 text-gray-600";
}
