// rates = units of currency per 1 yen, from GET /api/rates
export function localMoney(yen: number, currency: string, rates: Record<string, number>): string {
  const cur = rates[currency] ? currency : "USD";
  const v = yen * (rates[cur] ?? 0.0066);
  const digits = v >= 200 ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${cur} ${Math.round(v)}`;
  }
}
