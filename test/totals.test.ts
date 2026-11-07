import { describe, expect, it } from "vitest";
import { apiOrder, dailyTotals, postWebhook, setupTestApp } from "./helpers.js";

/** Строка ответа для заказов без скидок: total = gross = net. */
const day = (date: string, sum: number) => ({ date, total: sum, gross: sum, discount: 0, net: sum });

const ctx = setupTestApp();

describe("GET /customers/:id/daily-totals", () => {
  it("суммирует оплаченные заказы по дням в таймзоне клиента", async () => {
    // c_1 — Europe/Moscow (UTC+3): 20:30Z ещё 10-е, 21:30Z уже 11-е
    await postWebhook(ctx.app, apiOrder({ amount: 1000, createdAt: "2026-02-10T20:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: 250, createdAt: "2026-02-10T21:30:00Z" }));
    await postWebhook(ctx.app, apiOrder({ amount: "99", createdAt: "2026-02-11T10:00:00Z" }));

    const res = await dailyTotals(ctx.app, "c_1", "2026-02-09", "2026-02-11");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([day("2026-02-09", 0), day("2026-02-10", 1000), day("2026-02-11", 349)]);
  });

  it("учитывает переход на летнее время в таймзоне клиента", async () => {
    // Europe/Berlin: 29.03.2026 UTC+1 → UTC+2. Результат не должен зависеть от того, когда сделан запрос
    ctx.api.customers.set("c_7", "Europe/Berlin");
    const order = (amount: number, createdAt: string) => apiOrder({ customerId: "c_7", amount, createdAt, updatedAt: createdAt });
    await postWebhook(ctx.app, order(100, "2026-03-27T22:30:00Z")); // 23:30 CET → 27-е
    await postWebhook(ctx.app, order(200, "2026-03-28T22:30:00Z")); // 23:30 CET → 28-е
    await postWebhook(ctx.app, order(400, "2026-03-29T22:30:00Z")); // 00:30 CEST → 30-е
    await postWebhook(ctx.app, order(800, "2026-03-30T21:30:00Z")); // 23:30 CEST → 30-е
    await postWebhook(ctx.app, order(1600, "2026-03-30T22:30:00Z")); // 00:30 CEST → 31-е

    const res = await dailyTotals(ctx.app, "c_7", "2026-03-27", "2026-03-31");
    expect(res.json().map((d: { date: string; total: number }) => [d.date, d.total])).toEqual([
      ["2026-03-27", 100],
      ["2026-03-28", 200],
      ["2026-03-29", 0],
      ["2026-03-30", 1200],
      ["2026-03-31", 1600],
    ]);
  });

  it("скидки: gross до скидки, net — фактически оплачено, discount = gross - net", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 2500, discountPercent: 16.5, amountPaid: 2087.5 }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 2500, gross: 2500, discount: 412.5, net: 2087.5 }]);
  });

  it("скидки суммируются по дню с точностью до копейки", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 852, discountPercent: 10, amountPaid: 766.8 }));
    await postWebhook(ctx.app, apiOrder({ amount: "2609", discountPercent: "7", amountPaid: "2426.37" }));
    await postWebhook(ctx.app, apiOrder({ amount: 4499, discountPercent: 0, amountPaid: 4184.6 + 314.4 }));
    await postWebhook(ctx.app, apiOrder({ amount: 1000 })); // старый формат, без скидки
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    // 766.80 + 2426.37 + 4499.00 + 1000.00 = 8692.17; во float рублях было бы 8692.169999…
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 8960, gross: 8960, discount: 267.83, net: 8692.17 }]);
  });

  it("refunded со скидкой не учитывается ни в gross, ни в net", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 1000, discountPercent: 10, amountPaid: 900 }));
    await postWebhook(ctx.app, apiOrder({ amount: 5000, discountPercent: 20, amountPaid: 4000, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([{ date: "2026-02-10", total: 1000, gross: 1000, discount: 100, net: 900 }]);
  });

  it("не учитывает pending и refunded", async () => {
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 700, status: "pending" }));
    await postWebhook(ctx.app, apiOrder({ amount: 900, status: "refunded" }));
    const res = await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([day("2026-02-10", 500)]);
  });

  it("учитывает только заказы этого клиента", async () => {
    ctx.api.customers.set("c_2", "Asia/Novosibirsk");
    await postWebhook(ctx.app, apiOrder({ amount: 500 }));
    await postWebhook(ctx.app, apiOrder({ amount: 800, customerId: "c_2" }));
    const res = await dailyTotals(ctx.app, "c_2", "2026-02-10", "2026-02-10");
    expect(res.json()).toEqual([day("2026-02-10", 800)]);
  });

  it("таймзона клиента берётся из API один раз", async () => {
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    ctx.api.customers.set("c_1", "UTC");
    await dailyTotals(ctx.app, "c_1", "2026-02-10", "2026-02-10");
    const { rows } = await ctx.db.query(`SELECT timezone FROM customers WHERE id = 'c_1'`);
    expect(rows[0].timezone).toBe("Europe/Moscow");
  });

  it("валидирует даты", async () => {
    expect((await dailyTotals(ctx.app, "c_1", "2026-02-30", "2026-03-01")).statusCode).toBe(400);
    expect((await dailyTotals(ctx.app, "c_1", "2026-03-02", "2026-03-01")).statusCode).toBe(400);
  });

  it("ограничивает период 366 днями", async () => {
    expect((await dailyTotals(ctx.app, "c_1", "2025-01-01", "2026-01-01")).statusCode).toBe(200);
    expect((await dailyTotals(ctx.app, "c_1", "2025-01-01", "2026-01-02")).statusCode).toBe(400);
    expect((await dailyTotals(ctx.app, "c_1", "1900-01-01", "2100-01-01")).statusCode).toBe(400);
  });

  it("неизвестный клиент — 404", async () => {
    const res = await dailyTotals(ctx.app, "nobody", "2026-02-10", "2026-02-10");
    expect(res.statusCode).toBe(404);
  });
});
