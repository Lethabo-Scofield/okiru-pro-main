// @vitest-environment jsdom
/**
 * Showing the document behind a match.
 *
 * The importer fills in a B-BBEE level and an expiry from the registry, and
 * both move the procurement score. Until now the only way to check them was to
 * trust the match. These tests hold the preview to the two things that make it
 * worth having: it shows the file, and when it cannot, it says why in terms the
 * user can act on rather than failing quietly or showing an empty frame.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { CertificatePreview } from "../CertificatePreview";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe("the certificate preview", () => {
  it("shows nothing at all until a certificate is chosen", () => {
    render(<CertificatePreview certificateId={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId("certificate-preview")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the registry for a viewable link and renders the file", async () => {
    respond(200, { data: { url: "https://blob.example/cert.pdf?sig=x", content_type: "application/pdf", file_name: "cert.pdf" } });
    render(<CertificatePreview certificateId="blob-abc" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("certificate-preview-frame")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/certificates/blob-abc/view", { credentials: "include" });
    expect(screen.getByTestId("certificate-preview-frame")).toHaveAttribute(
      "src",
      "https://blob.example/cert.pdf?sig=x",
    );
  });

  /**
   * The question a preview answers during an import is "is this the right
   * company?", and one name cannot answer it.
   */
  it("shows the supplier's own name beside the registry's", async () => {
    respond(200, { data: { url: "https://blob.example/cert.pdf", content_type: "application/pdf" } });
    render(
      <CertificatePreview
        certificateId="blob-abc"
        supplierName="Interloc Freight Services"
        matchedName="Interlink Freight Services"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Interlink Freight Services")).toBeInTheDocument();
    expect(screen.getByText(/Interloc Freight Services/)).toBeInTheDocument();
  });

  it("does not repeat the name when both sides agree", async () => {
    respond(200, { data: { url: "https://blob.example/cert.pdf" } });
    render(
      <CertificatePreview
        certificateId="blob-abc"
        supplierName="Acme Trading"
        matchedName="Acme Trading"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("certificate-preview-frame")).toBeInTheDocument());
    expect(screen.queryByText(/Matched from your row/)).not.toBeInTheDocument();
  });

  it("renders an image certificate as an image, not in a frame", async () => {
    respond(200, { data: { url: "https://blob.example/cert.jpg", content_type: "image/jpeg", file_name: "cert.jpg" } });
    render(<CertificatePreview certificateId="blob-img" onClose={vi.fn()} />);

    expect(await screen.findByAltText("cert.jpg")).toBeInTheDocument();
    expect(screen.queryByTestId("certificate-preview-frame")).not.toBeInTheDocument();
  });

  /**
   * 1,484 certificates were sitting in storage unindexed on the day this was
   * written, so "the file is not there" is a state users will actually meet.
   */
  it("says plainly when the file is not in storage", async () => {
    respond(404, { error: { message: "Certificate file is missing" } });
    render(<CertificatePreview certificateId="blob-missing" onClose={vi.fn()} />);

    expect(await screen.findByText(/file is not in storage/i)).toBeInTheDocument();
  });

  it("distinguishes being denied from being broken", async () => {
    respond(403, {});
    render(<CertificatePreview certificateId="blob-forbidden" onClose={vi.fn()} />);

    expect(await screen.findByText(/do not have permission/i)).toBeInTheDocument();
  });

  it("does not show an empty frame when the response carries no url", async () => {
    respond(200, { data: { content_type: "application/pdf" } });
    render(<CertificatePreview certificateId="blob-nourl" onClose={vi.fn()} />);

    expect(await screen.findByText(/no viewable file/i)).toBeInTheDocument();
    expect(screen.queryByTestId("certificate-preview-frame")).not.toBeInTheDocument();
  });

  it("survives the certificate store being unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    render(<CertificatePreview certificateId="blob-abc" onClose={vi.fn()} />);

    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("closes on the button and on Escape", async () => {
    respond(200, { data: { url: "https://blob.example/cert.pdf" } });
    const onClose = vi.fn();
    render(<CertificatePreview certificateId="blob-abc" onClose={onClose} />);

    await userEvent.click(await screen.findByTestId("certificate-preview-close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
