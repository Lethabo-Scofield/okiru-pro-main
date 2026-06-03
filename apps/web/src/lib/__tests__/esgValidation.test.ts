import { describe, expect, it } from "vitest";
import { buildSgConsumerGoldenWorkbook } from "../../../EsgToolkit/src/lib/fixtures/esg-consumer-golden";
import { validateEsgWorkbookForSubmit } from "../esgValidation";
import { mergeEsgSectionCells } from "../esgGridRows";

describe("validateEsgWorkbookForSubmit", () => {
  it("blocks submit when King5 has fewer than 17 principle statuses", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const result = validateEsgWorkbookForSubmit(wb);
    const king5 = result.blockers.find((b) => b.id === "king5-principles");
    expect(king5).toBeDefined();
    expect(king5?.pass).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("allows submit when all 17 King5 statuses are filled", () => {
    const wb = buildSgConsumerGoldenWorkbook();
    const king5Rows = Array.from({ length: 17 }, (_, i) => ({
      _id: `k${i}`,
      num: i + 1,
      principle: `Principle ${i + 1}`,
      status: "Applied",
      weight: 6,
    }));
    wb.sections.king5 = {
      cells: mergeEsgSectionCells("king5", king5Rows, { E21: 135 }),
    };
    const king5 = validateEsgWorkbookForSubmit(wb).issues.find(
      (i) => i.id === "king5-principles",
    );
    expect(king5?.pass).toBe(true);
  });
});
