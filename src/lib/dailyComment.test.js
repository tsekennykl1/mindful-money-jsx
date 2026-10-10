import { describe, expect, test } from "bun:test";
import { DAILY_AMOUNT_STEP, DEFAULT_DAILY_ROWS, buildDailyComment, displayExpenseComment, rowsFromComment } from "./dailyComment";

describe("Daily expense rules", () => {
  test("amount arrows use one dollar increments", () => {
    expect(DAILY_AMOUNT_STEP).toBe(1);
  });
  test("Supermarket is included for new and existing days", () => {
    expect(DEFAULT_DAILY_ROWS.map((row) => row.category)).toContain("Supermarket");
    expect(rowsFromComment('["Breakfast"=38]').map((row) => row.category)).toContain("Supermarket");
  });
  test("structured comments display without brackets or double quotes", () => {
    expect(displayExpenseComment('["Breakfast"=38, "Lunch"=75]\n["Breakfast"="coffee", "Lunch"=""]')).toBe("Breakfast: $38 (coffee) · Lunch: $75");
  });
  test("ordinary expense comments lose brackets and quotes only for display", () => {
    expect(displayExpenseComment('["Weekly groceries"]')).toBe("Weekly groceries");
  });
  test("stored comments retain their existing format", () => {
    expect(buildDailyComment([{ category: "Supermarket", amount: "42", notes: "" }])).toBe('["Supermarket"=42]');
  });
});