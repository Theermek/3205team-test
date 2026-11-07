import { describe, expect, it } from "vitest";
import { apiOrder, postWebhook, setupTestApp } from "./helpers.js";

const ctx = setupTestApp();

describe("POST /webhooks/order", () => {
  it("создаёт заказ", async () => {
    const res = await postWebhook(ctx.app, apiOrder());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ result: "created" });
  });

  it("повтор того же события ничего не меняет", async () => {
    const o = apiOrder();
    await postWebhook(ctx.app, o);
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
  });

  it("устаревшее событие после нового игнорируется", async () => {
    const o = apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" });
    await postWebhook(ctx.app, { ...o, status: "refunded", updatedAt: "2026-02-11T12:00:00Z" });
    expect((await postWebhook(ctx.app, o)).json()).toEqual({ result: "stale" });
    const { rows } = await ctx.db.query(`SELECT status FROM orders WHERE id = $1`, [o.id]);
    expect(rows[0].status).toBe("refunded");
  });

  it("параллельные версии одного заказа: остаётся самая новая", async () => {
    // Внешняя система шлёт повторы разных версий пачкой, в пределах миллисекунды
    const orders = Array.from({ length: 20 }, () => apiOrder({ status: "paid", updatedAt: "2026-02-10T12:00:00Z" }));
    await Promise.all(
      orders.flatMap((o) => {
        const fresh = { ...o, status: "refunded", updatedAt: "2026-02-10T13:00:00Z" };
        return [fresh, o, fresh, o, o].map((v) => postWebhook(ctx.app, v));
      }),
    );
    const { rows } = await ctx.db.query(`SELECT status, count(*)::int AS n FROM orders GROUP BY status`);
    expect(rows).toEqual([{ status: "refunded", n: 20 }]);
  });

  it("новое событие обновляет заказ", async () => {
    const o = apiOrder({ status: "pending" });
    await postWebhook(ctx.app, o);
    const res = await postWebhook(ctx.app, { ...o, status: "paid", updatedAt: "2026-02-11T00:00:00Z" });
    expect(res.json()).toEqual({ result: "updated" });
  });

  it("сохраняет amountPaid; без него — NULL", async () => {
    const withDiscount = apiOrder({ amount: "2500.00", discountPercent: "16.5", amountPaid: "2087.50" });
    const legacy = apiOrder({ amount: 1000 });
    await postWebhook(ctx.app, withDiscount);
    await postWebhook(ctx.app, legacy);
    const { rows } = await ctx.db.query(`SELECT id, amount_kop, amount_paid_kop FROM orders ORDER BY id`);
    const byId = Object.fromEntries(rows.map((r) => [r.id, [Number(r.amount_kop), r.amount_paid_kop === null ? null : Number(r.amount_paid_kop)]]));
    expect(byId[withDiscount.id]).toEqual([250000, 208750]);
    expect(byId[legacy.id]).toEqual([100000, null]);
  });

  it("amountPaid больше amount или мусор — 400", async () => {
    expect((await postWebhook(ctx.app, apiOrder({ amount: 1000, amountPaid: 1000.01 }))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, apiOrder({ amount: 1000, amountPaid: "abc" }))).statusCode).toBe(400);
    expect((await postWebhook(ctx.app, apiOrder({ amount: 1000, amountPaid: -1 }))).statusCode).toBe(400);
  });

  it("невалидное тело — 400", async () => {
    const res = await postWebhook(ctx.app, { id: "x" });
    expect(res.statusCode).toBe(400);
  });
});
