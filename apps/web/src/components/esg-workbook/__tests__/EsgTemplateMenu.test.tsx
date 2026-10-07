// @vitest-environment jsdom
/**
 * "Download template" is a menu (C3): the whole workbook, each pillar, and
 * each sheet, every one a link to a part the server knows how to build.
 */
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EsgTemplateMenu } from "../EsgTemplateMenu";
import { ESG_TEMPLATE_GROUPS, esgTemplatePart } from "@/lib/esg/esgTemplateParts";

afterEach(() => cleanup());

const open = () => fireEvent.click(screen.getByTestId("esg-template-menu"));

describe("EsgTemplateMenu", () => {
  it("is closed until asked, and says so to assistive technology", () => {
    render(<EsgTemplateMenu />);
    const trigger = screen.getByTestId("esg-template-menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("esg-template-menu-list")).toBeNull();
    open();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", screen.getByTestId("esg-template-menu-list").id);
  });

  it("offers the whole workbook, each pillar and every sheet — each a part the server builds", () => {
    render(<EsgTemplateMenu />);
    open();
    const links = within(screen.getByTestId("esg-template-menu-list")).getAllByRole("link");
    const sheets = ESG_TEMPLATE_GROUPS.reduce((n, g) => n + g.sheets.length, 0);
    expect(links).toHaveLength(1 + ESG_TEMPLATE_GROUPS.length + sheets);
    for (const link of links) {
      const part = new URL(link.getAttribute("href") ?? "", "http://okiru.test").searchParams.get("part");
      expect(esgTemplatePart(part)).not.toBeNull();
    }
    for (const group of ESG_TEMPLATE_GROUPS) {
      const box = screen.getByRole("group", { name: group.title });
      expect(within(box).getAllByRole("link")).toHaveLength(1 + group.sheets.length);
    }
  });

  it("closes on Escape, on a click elsewhere, and once a part is chosen", () => {
    render(
      <div>
        <p>elsewhere</p>
        <EsgTemplateMenu />
      </div>,
    );
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("esg-template-menu-list")).toBeNull();

    open();
    fireEvent.mouseDown(screen.getByText("elsewhere"));
    expect(screen.queryByTestId("esg-template-menu-list")).toBeNull();

    open();
    fireEvent.click(screen.getByTestId("esg-template-social"));
    expect(screen.queryByTestId("esg-template-menu-list")).toBeNull();
  });
});
