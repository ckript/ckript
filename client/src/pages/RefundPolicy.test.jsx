// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AuthContext } from "../context/AuthContext";
import RefundPolicy from "./RefundPolicy";

/*
 * The Refund Policy the Terms of Service incorporate by reference. What it must always say: refunds
 * are documented with a credit note, the taxes paid come back with the amount, and how to cancel a
 * plan or a booking.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const render = () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(
    <AuthContext.Provider value={{ user: null }}>
      <MemoryRouter><RefundPolicy /></MemoryRouter>
    </AuthContext.Provider>,
  ));
  return host.textContent;
};

describe("RefundPolicy", () => {
  it("says refunds carry a credit note and return the taxes paid", () => {
    const text = render();
    expect(text).toContain("Refund & Cancellation Policy");
    expect(text).toMatch(/credit note/i);
    expect(text).toMatch(/taxes you paid on the refunded amount are refunded/i);
  });

  it("explains cancelling a plan and a consultation", () => {
    const text = render();
    expect(text).toMatch(/Settings → Plan & billing/);
    expect(text).toMatch(/end of the period you have already paid for/);
    expect(text).toMatch(/waiting for the professional to respond/);
  });

  it("gives every section an anchor the contents list links to", () => {
    render();
    const anchors = [...host.querySelectorAll('nav[aria-label="Contents"] a')].map((a) => a.getAttribute("href").slice(1));
    expect(anchors.length).toBeGreaterThan(5);
    for (const id of anchors) expect(host.querySelector(`#${id}`)).not.toBeNull();
  });
});
