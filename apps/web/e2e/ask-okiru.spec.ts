import { expect, test } from "@playwright/test";

test.describe("Ask Okiru scorecard advisor", () => {
  test.beforeEach(async ({ page, request }) => {
    const login = await request.post("/api/auth/login", { data: { username: "demo", password: "demo" } });
    expect(login.ok()).toBeTruthy();
    const state = await request.storageState();
    await page.context().addCookies(state.cookies);
    await page.addInitScript(() => {
      localStorage.setItem("okiru-pro-active-client", "e2e-scorecard");
    });
  });

  test("exists only on the B-BBEE scorecard page", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/hub");
    await expect(page.getByTestId("button-scorecard-advisor-open")).toHaveCount(0);

    await page.goto("/create-scorecard");
    await expect(page.getByTestId("button-scorecard-advisor-open")).toHaveCount(0);

    await page.goto("/toolkit/scorecard");
    await expect(page.getByTestId("button-scorecard-advisor-open")).toBeVisible();
  });

  test("opens Ask Okiru and answers from scorecard plus ontology context", async ({ page }) => {
    await page.goto("/toolkit/scorecard");
    await page.getByTestId("button-scorecard-advisor-open").click();
    await expect(page.getByTestId("scorecard-advice-chat")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ask Okiru" })).toBeVisible();

    await page.getByTestId("scorecard-advice-input").fill("What is the SED target?");
    await page.getByTestId("scorecard-advice-send").click();
    await expect(page.getByText(/1% of Net Profit After Tax/)).toBeVisible();
    await expect(page.getByText(/Business rule: Sed/)).toBeVisible();
  });

  test("uses the current scorecard snapshot", async ({ page }) => {
    await page.goto("/toolkit/scorecard");
    await page.getByTestId("button-scorecard-advisor-open").click();
    await page.getByTestId("scorecard-advice-input").fill("Explain the level");
    await page.getByTestId("scorecard-advice-send").click();
    await expect(page.getByText(/Level|Non-Compliant/).last()).toBeVisible();
    await expect(page.getByText(/points/).last()).toBeVisible();
  });
});
