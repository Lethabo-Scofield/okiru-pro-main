// @vitest-environment jsdom
/**
 * The form has to refuse before the endpoint does.
 *
 * The endpoint is the real gate, but a user who fills in a name, presses the
 * button and gets a 400 has been told off for following the form. So these
 * tests are about the form doing its own job: not offering the action until
 * the four fields are there, and saying which one is missing.
 *
 * They also pin the thing that is easy to get wrong in the other direction —
 * a form that opens already covered in red because nothing has been typed yet.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NewCompanyForm, EMPTY_NEW_COMPANY, type NewCompanyValues } from "../NewCompanyForm";

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const [values, setValues] = useState<NewCompanyValues>(EMPTY_NEW_COMPANY);
  return <NewCompanyForm values={values} onChange={setValues} onSubmit={onSubmit} />;
}

afterEach(cleanup);

const submitButton = () => screen.getByTestId("button-start-scorecard");

describe("the new company form", () => {
  it("opens without telling anyone off", () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(screen.queryByText(/is required/i)).not.toBeInTheDocument();
  });

  it("will not submit on a name alone", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByTestId("input-new-company"), "Acme Trading");
    expect(submitButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("enables only once all four are there", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByTestId("input-new-company"), "Acme Trading");
    await userEvent.selectOptions(screen.getByTestId("select-new-company-sector"), "RCOGP");
    await userEvent.selectOptions(screen.getByTestId("select-new-company-type"), "QSE");
    expect(submitButton()).toBeDisabled();

    // The date input commits on blur or Enter, not on each keystroke, so the
    // form cannot judge a half-typed date as invalid while it is being typed.
    await userEvent.type(screen.getByTestId("input-new-company-fye"), "28/2/2026");
    await userEvent.tab();
    expect(submitButton()).toBeEnabled();

    await userEvent.click(submitButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /**
   * The type list is per sector: FSC has no QSE. Leaving a stale "QSE" selected
   * after switching to FSC would submit a combination that cannot be scored.
   */
  it("drops a scorecard type the new sector does not offer", async () => {
    render(<Harness onSubmit={vi.fn()} />);

    await userEvent.selectOptions(screen.getByTestId("select-new-company-sector"), "RCOGP");
    await userEvent.selectOptions(screen.getByTestId("select-new-company-type"), "QSE");
    expect(screen.getByTestId("select-new-company-type")).toHaveValue("QSE");

    await userEvent.selectOptions(screen.getByTestId("select-new-company-sector"), "FSC");
    // FSC offers Generic only, so it is chosen rather than left blank.
    expect(screen.getByTestId("select-new-company-type")).toHaveValue("Generic");
  });

  it("keeps the type locked until a sector picks the list", () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(screen.getByTestId("select-new-company-type")).toBeDisabled();
  });

  it("names the missing field once the user has been there", async () => {
    render(<Harness onSubmit={vi.fn()} />);

    const name = screen.getByTestId("input-new-company");
    await userEvent.click(name);
    await userEvent.tab();

    expect(await screen.findByText(/company name is required/i)).toBeInTheDocument();
  });

  /** Everything at once on submit, not one problem revealed per attempt. */
  it("marks every missing field when an empty form is submitted", async () => {
    render(<Harness onSubmit={vi.fn()} />);

    // The button is disabled, so Enter in the name field is the way in.
    await userEvent.type(screen.getByTestId("input-new-company"), "{Enter}");

    expect(await screen.findByText(/sector is required/i)).toBeInTheDocument();
    expect(screen.getByText(/scorecard type is required/i)).toBeInTheDocument();
    expect(screen.getByText(/financial year end is required/i)).toBeInTheDocument();
  });

  it("says the measurement period stays editable", () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(screen.getByText(/change the\s+start and end dates/i)).toBeInTheDocument();
  });
});
