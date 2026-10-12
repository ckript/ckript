import { describe, expect, it } from "vitest";
import { CHECKOUT_STANDING, getPurchasePricing } from "../../../../pages/script-detail/checkout";
import {
  buildAcceptanceRows,
  buildAmountRows,
  buildRightsRows,
  buildTermsPanels,
  describeAlternative,
  describeChargeLine,
  describePayControl,
} from "./checkoutModel";

const pricing = getPurchasePricing(240000);

describe("buildAmountRows", () => {
  it("puts the total last and marks it as the total", () => {
    const rows = buildAmountRows(pricing);
    expect(rows.map((row) => row.key)).toEqual(["base", "fee", "total"]);
    expect(rows[2].tone).toBe("total");
  });

  it("names the commission with the rate the pricing actually used", () => {
    expect(buildAmountRows({ ...pricing, platformFeePercent: 8 })[1].label).toContain("8%");
  });
});

describe("describeChargeLine", () => {
  it("says nothing when the gateway will charge what the page already showed", () => {
    expect(describeChargeLine(null)).toBe("");
    expect(describeChargeLine({ currency: "INR", isForeign: false, label: "₹2,52,000.00" })).toBe("");
  });

  it("states the buyer's currency when the gateway will use it (DEF-31)", () => {
    const line = describeChargeLine({ currency: "USD", isForeign: true, label: "$3,024.00" });
    expect(line).toContain("$3,024.00");
    expect(line).toContain("converted");
  });

  it("explains a fallback to rupees, which is a different fact from a foreign charge", () => {
    const line = describeChargeLine({ currency: "INR", isForeign: false, fellBackToINR: true, label: "₹2,52,000.00" });
    expect(line).toContain("not accepted");
  });
});

describe("buildRightsRows", () => {
  it("reads the shared vocabulary, including the enum the old private maps dropped (DEF-28)", () => {
    const rows = buildRightsRows({ rightsLicensing: { negotiationMode: "ckript_not_involved" } });
    expect(rows.find((row) => row.key === "negotiation").value).toBe("Ckript not involved");
  });

  it("says 'Not specified' rather than inventing a term the writer never chose", () => {
    const rows = buildRightsRows({});
    expect(rows.every((row) => row.value.length > 0)).toBe(true);
    expect(rows.find((row) => row.key === "type").value).toBe("Not specified");
  });

  it("only time-bounds an exclusive license, and only shows a royalty that exists", () => {
    const exclusive = buildRightsRows({
      rightsLicensing: { rightsType: "exclusive_license", timeBound: { licenseDurationMonths: 24 }, royaltySettings: { percentage: 5 } },
    });
    expect(exclusive.find((row) => row.key === "duration").value).toBe("24 months");
    expect(exclusive.find((row) => row.key === "royalty").value).toBe("5%");

    const sale = buildRightsRows({ rightsLicensing: { rightsType: "full_rights_sale" } });
    expect(sale.find((row) => row.key === "duration").value).toBe("Not time-bound");
    expect(sale.find((row) => row.key === "royalty")).toBeUndefined();
  });
});

describe("the terms and their checkboxes", () => {
  it("shows two documents and two boxes when the writer wrote no conditions of their own", () => {
    expect(buildTermsPanels({}).map((panel) => panel.key)).toEqual(["platform", "writer"]);
    expect(buildAcceptanceRows({}).map((row) => row.key)).toEqual(["platform", "writer", "rights"]);
  });

  it("shows the writer's conditions in full, and asks for them separately", () => {
    const script = { legal: { customInvestorTerms: "Credit must read “from the archive of Ramgarh”." } };
    const custom = buildTermsPanels(script).find((panel) => panel.key === "custom");
    expect(custom.body).toContain("Ramgarh");
    // No link: this text has no URL of its own, unlike the two platform documents.
    expect(custom.to).toBe("");
    expect(buildAcceptanceRows(script).map((row) => row.key)).toContain("custom");
  });

  it("ignores whitespace-only custom terms rather than asking for an empty agreement", () => {
    expect(buildAcceptanceRows({ legal: { customInvestorTerms: "   " } }).map((row) => row.key)).not.toContain("custom");
  });
});

describe("describePayControl", () => {
  const payable = { id: CHECKOUT_STANDING.PAYABLE, pricing };

  it("names the amount on the control, so the button and the total agree", () => {
    expect(describePayControl({ standing: payable }).label).toContain("2,52,000");
  });

  it("does not say 'pay' where nothing is paid", () => {
    const label = describePayControl({ standing: { id: CHECKOUT_STANDING.FREE, pricing: getPurchasePricing(0) } }).label;
    expect(label).toBe("Confirm and unlock");
  });

  it("distinguishes opening the sheet from finishing a payment already taken", () => {
    expect(describePayControl({ standing: payable, processing: true }).label).toContain("payment sheet");
    expect(describePayControl({ standing: payable, recovering: true }).label).toContain("Finishing");
    expect(describePayControl({ standing: payable, recovering: true }).pending).toBe(true);
  });
});

describe("describeAlternative", () => {
  it("gives every non-payable standing somewhere real to go", () => {
    const ids = Object.values(CHECKOUT_STANDING);
    ids.forEach((id) => {
      const alternative = describeAlternative({ standing: { id }, projectPath: "/monsoon/mira" });
      expect(alternative.label.length).toBeGreaterThan(0);
      expect(alternative.to.length).toBeGreaterThan(0);
    });
  });

  it("sends a buyer who cannot buy here to other projects, not back to this one", () => {
    expect(describeAlternative({ standing: { id: CHECKOUT_STANDING.SOLD }, projectPath: "/monsoon/mira" }).to).toBe("/search");
    expect(describeAlternative({ standing: { id: CHECKOUT_STANDING.NOT_BUYER }, projectPath: "/monsoon/mira" }).to).toBe("/search");
  });

  it("sends an expired window back to the project, where a new request is sent from", () => {
    const alternative = describeAlternative({ standing: { id: CHECKOUT_STANDING.EXPIRED }, projectPath: "/monsoon/mira" });
    expect(alternative.to).toBe("/monsoon/mira");
    expect(alternative.label).toContain("request");
  });
});
