import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { clarityProjectId, withClarity } from "../clarity";
import { productForPath } from "../../src/lib/clarityContext";

const PAGE = "<!doctype html><html><head><title>Okiru</title>\n  </head><body></body></html>";

describe("Clarity injection", () => {
  it("adds nothing when no project id is configured", () => {
    expect(withClarity(PAGE, undefined)).toBe(PAGE);
    expect(withClarity(PAGE, "")).toBe(PAGE);
    expect(withClarity(PAGE, "   ")).toBe(PAGE);
  });

  it("loads Clarity's tag for the configured project, inside <head>", () => {
    const html = withClarity(PAGE, "k2x9abc1de");
    expect(html).toContain('"clarity","script","k2x9abc1de"');
    expect(html).toContain("https://www.clarity.ms/tag/");
    expect(html.indexOf("clarity.ms")).toBeLessThan(html.indexOf("</head>"));
  });

  it("refuses an id that could break out of the script", () => {
    // The id is spliced into an inline script; anything but a plain id is dropped.
    expect(clarityProjectId('abc");alert(1);//')).toBeNull();
    expect(clarityProjectId("abc</script><script>x")).toBeNull();
    expect(withClarity(PAGE, 'abc");alert(1);//')).toBe(PAGE);
  });

  it("ships the page with every piece of text masked", () => {
    // The privacy guarantee lives in the page, not in the Clarity dashboard.
    const index = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
    expect(index).toMatch(/<body[^>]*data-clarity-mask="True"/);
  });
});

describe("serveStatic with Clarity", () => {
  // A real Express app over a throwaway build folder, on a real port.
  async function serve(projectId: string | undefined) {
    const os = await import("os");
    const express = (await import("express")).default;
    const { serveStatic } = await import("../static");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "okiru-static-"));
    const dist = path.join(root, "dist", "public");
    fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
    fs.writeFileSync(path.join(dist, "index.html"), PAGE);
    fs.writeFileSync(path.join(dist, "assets", "app-abc.js"), "console.log(1)");
    const cwd = process.cwd();
    const before = process.env.CLARITY_PROJECT_ID;
    process.chdir(root);
    if (projectId === undefined) delete process.env.CLARITY_PROJECT_ID;
    else process.env.CLARITY_PROJECT_ID = projectId;
    const app = express();
    try {
      serveStatic(app);
    } finally {
      process.chdir(cwd);
      if (before === undefined) delete process.env.CLARITY_PROJECT_ID;
      else process.env.CLARITY_PROJECT_ID = before;
    }
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    const get = (p: string) => fetch(`http://127.0.0.1:${port}${p}`);
    return { get, close: () => new Promise((r) => server.close(r)) };
  }

  it("serves the Clarity-tagged page at / and on every client route", async () => {
    const s = await serve("k2x9abc1de");
    try {
      for (const route of ["/", "/esg/C-1/workbook", "/create-scorecard"]) {
        const res = await s.get(route);
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-cache");
        expect(await res.text()).toContain('"clarity","script","k2x9abc1de"');
      }
      // Assets are untouched, and a missing chunk is still a real 404.
      expect(await (await s.get("/assets/app-abc.js")).text()).toBe("console.log(1)");
      expect((await s.get("/assets/gone.js")).status).toBe(404);
    } finally {
      await s.close();
    }
  });

  it("serves the page unchanged when Clarity is off", async () => {
    const s = await serve(undefined);
    try {
      expect(await (await s.get("/")).text()).toBe(PAGE);
    } finally {
      await s.close();
    }
  });
});

describe("Clarity product tag", () => {
  it("separates ESG from B-BBEE from the rest of the platform", () => {
    expect(productForPath("/esg/C-1/workbook")).toBe("esg");
    expect(productForPath("/esg")).toBe("esg");
    expect(productForPath("/create-scorecard/C-10001/estimate")).toBe("bbbee");
    expect(productForPath("/bbbee/C-1/documents")).toBe("bbbee");
    expect(productForPath("/toolkit/scorecard")).toBe("bbbee");
    expect(productForPath("/documents/abc")).toBe("platform");
    expect(productForPath("/esgx")).toBe("platform");
  });
});
