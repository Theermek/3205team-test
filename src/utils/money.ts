/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  }
  return value;
}

/**
 * Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем.
 * `rub * 100` во float неточно (4184.6 * 100 = 418459.99999999994), поэтому сначала
 * округляем до миллионных долей рубля и только потом отбрасываем доли копейки.
 */
export function toKop(rub: number): number {
  return Math.floor(Math.round(rub * 1_000_000) / 10_000);
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}
