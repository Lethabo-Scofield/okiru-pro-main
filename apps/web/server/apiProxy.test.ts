import { describe, expect, it } from "vitest";
import { proxyTargetFor } from "./apiProxy";

describe("API proxy routing", () => {
  it("routes standalone parser calls to the parser service", () => {
    expect(proxyTargetFor("/api/parser/quote-files")).toBe("http://127.0.0.1:3200");
  });

  it("routes parser document-library calls to the API service", () => {
    expect(proxyTargetFor("/api/parser-documents/upload")).toBe("http://127.0.0.1:3000");
  });
});
