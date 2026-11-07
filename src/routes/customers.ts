import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Container } from "../container.js";
import { ValidationError } from "../errors.js";
import { isCalendarDate } from "../utils/time.js";

const Query = z.object({ from: z.string(), to: z.string() });

/** Ответ строится по дню на каждую дату — без ограничения запрос за 100 лет даёт ~36 500 элементов. */
const MAX_DAYS = 366;
const DAY = 86_400_000;

export function customerRoutes(app: FastifyInstance, c: Container) {
  app.get<{ Params: { id: string } }>("/customers/:id/daily-totals", async (req) => {
    const q = Query.safeParse(req.query);
    if (!q.success || !isCalendarDate(q.data.from) || !isCalendarDate(q.data.to)) {
      throw new ValidationError("from and to must be dates in YYYY-MM-DD format");
    }
    if (q.data.from > q.data.to) throw new ValidationError("from must be <= to");
    if ((Date.parse(q.data.to) - Date.parse(q.data.from)) / DAY + 1 > MAX_DAYS) {
      throw new ValidationError(`period must be at most ${MAX_DAYS} days`);
    }
    return c.totals.daily(req.params.id, q.data.from, q.data.to);
  });
}
