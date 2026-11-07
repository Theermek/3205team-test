import { describe, expect, it } from "vitest";
import { dateAtOffset, datesBetween, isCalendarDate, localDateIn, parseUtc, tzOffsetMinutes } from "../src/utils/time.js";

describe("parseUtc", () => {
  it("строка с Z", () => {
    expect(parseUtc("2026-03-01T00:40:39.000Z").toISOString()).toBe("2026-03-01T00:40:39.000Z");
  });

  it("строка без зоны — тоже UTC", () => {
    expect(parseUtc("2026-03-01T00:40:39").toISOString()).toBe("2026-03-01T00:40:39.000Z");
  });

  it("мусор — ошибка", () => {
    expect(() => parseUtc("вчера")).toThrow();
    expect(() => parseUtc(42)).toThrow();
  });
});

describe("tzOffsetMinutes", () => {
  it("считает смещение таймзоны", () => {
    const at = new Date("2026-02-10T12:00:00Z");
    expect(tzOffsetMinutes("UTC", at)).toBe(0);
    expect(tzOffsetMinutes("Europe/Moscow", at)).toBe(180);
    expect(tzOffsetMinutes("Asia/Novosibirsk", at)).toBe(420);
    expect(tzOffsetMinutes("America/New_York", at)).toBe(-300);
  });
});

describe("localDateIn", () => {
  it("дата в таймзоне", () => {
    const moscow = localDateIn("Europe/Moscow");
    expect(moscow(new Date("2026-02-10T20:30:00Z"))).toBe("2026-02-10");
    expect(moscow(new Date("2026-02-10T21:30:00Z"))).toBe("2026-02-11");
  });

  it("учитывает переход на летнее время (Europe/Berlin, 29.03.2026)", () => {
    const berlin = localDateIn("Europe/Berlin");
    // до перехода UTC+1: полночь — 23:00Z
    expect(berlin(new Date("2026-03-27T22:30:00Z"))).toBe("2026-03-27");
    expect(berlin(new Date("2026-03-27T23:30:00Z"))).toBe("2026-03-28");
    // после перехода UTC+2: полночь — 22:00Z
    expect(berlin(new Date("2026-03-30T21:30:00Z"))).toBe("2026-03-30");
    expect(berlin(new Date("2026-03-30T22:30:00Z"))).toBe("2026-03-31");
  });

  it("учитывает переход на летнее время (America/New_York, 08.03.2026)", () => {
    const ny = localDateIn("America/New_York");
    expect(ny(new Date("2026-03-07T04:30:00Z"))).toBe("2026-03-06"); // UTC-5
    expect(ny(new Date("2026-03-10T04:30:00Z"))).toBe("2026-03-10"); // UTC-4
  });
});

describe("даты", () => {
  it("dateAtOffset", () => {
    expect(dateAtOffset(new Date("2026-02-10T21:30:00Z"), 180)).toBe("2026-02-11");
    expect(dateAtOffset(new Date("2026-02-10T20:30:00Z"), 180)).toBe("2026-02-10");
  });

  it("isCalendarDate", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("26-02-01")).toBe(false);
  });

  it("datesBetween включает границы", () => {
    expect(datesBetween("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });
});
