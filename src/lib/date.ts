export function getSaoPauloDateString(date: Date | string | number = new Date()) {
  const value = typeof date === "string" || typeof date === "number"
    ? new Date(date)
    : date;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function getSaoPauloDateRange(days: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  return {
    todayKey: getSaoPauloDateString(today),
    startKey: getSaoPauloDateString(start),
  };
}