/**
 * The AI review's small print must be readable. --muted (white at 32% on the
 * app's near-black) is about 2.9:1, under the 4.5:1 that text needs; the cell
 * a fill will change, what it replaces, its evidence and the question labels
 * were all drawn in it. --body (about 6.4:1) is the floor for text here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FILES = ["../ExtractionReviewModal.tsx", "../AiFillMarker.tsx"];

describe("AI review text contrast", () => {
  it.each(FILES)("%s draws no text in --muted", (file) => {
    const source = readFileSync(resolve(__dirname, file), "utf8");
    expect(source).not.toMatch(/text-\[color:var\(--muted\)\]/);
  });
});
