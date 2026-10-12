/*
 * ProjectCheckoutMobile — the buyer's checkout at `/script/:id/pay` (prefix: ckm-checkout, D30).
 *
 * WHAT MAKES THIS SCREEN DIFFERENT FROM EVERY OTHER ONE IN THE APP
 * ---------------------------------------------------------------
 * Its primary control hands the viewer to a surface we do not own and cannot style, measure or
 * dismiss: Razorpay's checkout overlay, in an iframe, outside our DOM. Three consequences shaped
 * this file.
 *
 *   1. THE SCREEN MUST BE COMPLETE BEFORE THE HANDOVER. Everything the buyer is agreeing to — the
 *      amount, the commission, the rights terms, the writer's own conditions, the deadline — is on
 *      this page, above the control, in DOM order. Once the sheet is open our page is not the one
 *      being read.
 *   2. LEAVING MID-CHECKOUT MUST NOT ORPHAN A CHARGE. The gateway's callback runs in our page
 *      AFTER the money has moved, and the request that unlocks the screenplay is made from it. A
 *      back gesture, a dropped connection or a browser evicting a backgrounded tab in between used
 *      to leave a charged buyer with the sentence "contact support". `useProjectCheckout` writes
 *      the payment down before verifying it and retries on the way back in (DEF-32); this screen
 *      renders that retry as a state the buyer can see, not as a silent background job.
 *   3. NOTHING IS DISABLED. D29's rule, and here it earns its keep twice over: the pay control
 *      stays live with an unticked box so that pressing it produces the SENTENCE naming the box —
 *      a `disabled` attribute would remove the control from the tab order and take its description
 *      with it — and every standing in which payment is impossible replaces the control with words
 *      and a real way forward, because most of them are reached from a link that was correct when
 *      it was sent.
 *
 * WHAT IT DELIBERATELY DROPS FROM THE DESKTOP PAGE
 * -----------------------------------------------
 *   • The two-column grid of "Payment Breakdown" beside "Terms & Conditions". On a phone the
 *     amount comes first and the terms follow it, because that is the order they are read in.
 *   • `window.confirm("Payment successful. Do you want to download your invoice now?")`. A blocking
 *     browser dialog fired 120ms after a success banner is the wrong instrument on a phone; the
 *     invoice and the accepted-terms PDF are two named buttons in the success panel instead.
 */
import { useCallback, useContext, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { AuthContext } from "../../../../context/AuthContext";
import { useCurrency } from "../../../../context/CurrencyContext";
import { CHECKOUT_STANDING, purchaseFileName } from "../../../../pages/script-detail/checkout";
import {
  PROJECT_DETAIL_STATUS,
  useProjectDetail,
} from "../../../../pages/script-detail/useProjectDetail";
import { useProjectCheckout } from "../../../../pages/script-detail/useProjectCheckout";
import { getScriptCanonicalPath } from "../../../../utils/scriptPath";
import PageHeader from "../../../components/app-bars/PageHeader";
import Button from "../../../components/buttons/Button";
import EmptyState from "../../../components/EmptyState";
import InlineMessage from "../../../components/feedback/InlineMessage";
import SkeletonGroup, { SkeletonShape } from "../../../components/feedback/Skeletons";
import { useToast } from "../../../components/feedback/toastContext";
import Checkbox from "../../../components/forms/Checkbox";
import MobileShell from "../../../shell/MobileShell";
import {
  CHECKOUT_SHELL_MODE,
  CHECKOUT_SHELL_SLOTS,
  saveBlob,
} from "./checkoutChrome";
import {
  AMOUNT_NOTE,
  AMOUNT_NOTE_TAXED,
  buildAcceptanceRows,
  buildAmountRows,
  buildRightsRows,
  buildTermsPanels,
  describeAlternative,
  describeChargeLine,
  describePayControl,
  EXCLUSIVITY_WARNING,
} from "./checkoutModel";
import "./ProjectCheckoutMobile.css";
import BillingSection from "../../../../components/checkout/BillingSection";
import useBillingDetails from "../../../../components/checkout/useBillingDetails";

const has = (value) => String(value ?? "").trim().length > 0;

function CheckoutLoading() {
  return (
    <SkeletonGroup label="Loading this payment" className="ckm-checkout__loading">
      <SkeletonShape height={92} radius="var(--ckm-r-lg)" />
      <SkeletonShape height={148} radius="var(--ckm-r-lg)" />
      <SkeletonShape height={196} radius="var(--ckm-r-lg)" />
    </SkeletonGroup>
  );
}

export default function ProjectCheckoutMobile({
  user: userProp = undefined,
  /* The settled project a sweep needs; the live route's payload is per-viewer (see the harness). */
  previewData = null,
}) {
  const params = useParams();
  const location = useLocation();
  const toast = useToast();
  const auth = useContext(AuthContext);
  const user = userProp ?? auth?.user ?? null;
  const { currency } = useCurrency() || {};

  /*
   * The same read layer as the project page, and deliberately WITHOUT its canonicalization: this
   * URL is `/script/:id/pay`, which has no heading/username form, so handing `useProjectDetail` an
   * `onCanonicalPath` here would rewrite the buyer's checkout into the project page mid-payment.
   */
  const detail = useProjectDetail({
    id: params.id,
    user,
    pathname: location.pathname,
    enabled: !previewData,
  });

  const script = previewData ?? detail.script;
  const status = previewData ? PROJECT_DETAIL_STATUS.READY : detail.status;

  const notify = useCallback((message, tone = "success") => {
    if (tone === "error") toast.error(message);
    else toast.success(message);
  }, [toast]);

  const checkout = useProjectCheckout({
    script,
    user,
    currency,
    refresh: detail.refresh,
    notify,
    enabled: !previewData,
  });
  // Billing details address the tax invoice; asked for only while taxes are being charged.
  const billingDetails = useBillingDetails({ enabled: !previewData });

  const [documentError, setDocumentError] = useState("");

  const projectPath = useMemo(
    () => getScriptCanonicalPath(script || { _id: params.id }) || `/script/${params.id}`,
    [script, params.id],
  );

  const takeInvoice = useCallback(async () => {
    setDocumentError("");
    const blob = await checkout.openInvoice({ download: true });
    if (!blob) return;
    const saved = saveBlob(blob, purchaseFileName(script?.title, "invoice"));
    if (!saved) setDocumentError("This browser would not save the invoice. Open it from Payments in your account.");
  }, [checkout, script]);

  const takeAcceptedTerms = useCallback(async () => {
    setDocumentError("");
    const blob = await checkout.downloadAcceptedTerms();
    if (!blob) return;
    const saved = saveBlob(blob, purchaseFileName(script?.title, "accepted_terms"));
    if (!saved) setDocumentError("This browser would not save the document. Open it from Payments in your account.");
  }, [checkout, script]);

  const header = (
    <PageHeader
      title={status === PROJECT_DETAIL_STATUS.READY && script?.title ? script.title : "Payment"}
      subtitle={status === PROJECT_DETAIL_STATUS.READY && script?.title ? "Screenplay purchase" : ""}
      backTo={projectPath}
      backLabel="Back to the project"
    />
  );

  const shell = (children, bottom = null) => (
    <MobileShell
      mode={CHECKOUT_SHELL_MODE}
      slots={bottom ? CHECKOUT_SHELL_SLOTS : null}
      screenId="project-checkout"
      className="ckm-checkout"
      scrollClassName="ckm-checkout__scroll"
      appBar={header}
      bottomNav={bottom}
      onConnectionRestored={detail.reload}
    >
      {children}
    </MobileShell>
  );

  if (status === PROJECT_DETAIL_STATUS.LOADING) return shell(<CheckoutLoading />);

  if (status === PROJECT_DETAIL_STATUS.BLOCKED) {
    return shell(
      <EmptyState
        icon="lock"
        titleAs="h2"
        title="This purchase needs a verified industry account"
        body={detail.failure?.message || "You need a business email or a plan to buy screenplays here."}
        actions={(
          <>
            <Button variant="primary" to="/pricing">See industry plans</Button>
            <Button variant="secondary" to="/search">Browse projects</Button>
          </>
        )}
      />,
    );
  }

  if (status === PROJECT_DETAIL_STATUS.ERROR || !script) {
    const notFound = Boolean(detail.failure?.notFound);
    return shell(
      notFound ? (
        <EmptyState
          icon="search_off"
          titleAs="h2"
          title="This payment link is no longer valid"
          body="The project may have been removed, or the link may be out of date."
          actions={<Button variant="secondary" to="/search">Browse projects</Button>}
        />
      ) : (
        <InlineMessage variant="panel" title="This payment could not be loaded" onRetry={detail.reload}>
          {detail.failure?.message || "Check your connection and try again."}
        </InlineMessage>
      ),
    );
  }

  const { standing, pricing, success, pendingCharge, recovering } = checkout;
  const amountRows = buildAmountRows(pricing, checkout.breakdown);
  const rightsRows = buildRightsRows(script);
  const termsPanels = buildTermsPanels(script);
  const acceptanceRows = buildAcceptanceRows(script);
  const chargeLine = describeChargeLine(checkout.lastCharge);
  const alternative = describeAlternative({ standing, projectPath });
  const payControl = describePayControl({ standing, processing: checkout.processing, recovering, breakdown: checkout.breakdown });
  const showForm = standing.canPay && !success;
  const askBilling = billingDetails.chargingEnabled && checkout.requiresPayment && showForm;
  const startPayment = () => {
    if (!askBilling) return checkout.pay();
    const prepared = billingDetails.prepare();
    return prepared ? checkout.pay(prepared) : false;
  };

  const footer = success ? null : (
    <div className="ckm-checkout__footer">
      {/*
        * The refusal is TEXT above the control and in DOM order before it, so a screen reader
        * meets the reason on the way to the button rather than after pressing it. The button
        * itself stays live: pressing it with a box unticked is how a buyer finds out which box.
        */}
      {showForm && has(checkout.missingAcceptance) && (
        <p className="ckm-checkout__footer-reason">{checkout.missingAcceptance}</p>
      )}
      {showForm && checkout.gatewayBlocked && (
        <p className="ckm-checkout__footer-reason">
          The payment provider&apos;s script has not loaded. Pressing pay will try again.
        </p>
      )}

      {showForm ? (
        <Button
          variant="primary"
          fullWidth
          pending={payControl.pending}
          pendingLabel={payControl.label}
          onClick={startPayment}
        >
          {payControl.label}
        </Button>
      ) : (
        <Button variant="secondary" fullWidth to={alternative.to}>{alternative.label}</Button>
      )}
    </div>
  );

  return shell(
    <>
      {/* The standing is the first thing on the screen, before any amount: whether this payment can
          happen at all changes what every number below it means. */}
      <section className="ckm-checkout__standing" data-standing={standing.id}>
        <h2 className="ckm-checkout__standing-title">{standing.headline}</h2>
        <p className="ckm-checkout__standing-note">{standing.note}</p>
        <p className="ckm-checkout__writer">
          Written by {script?.creator?.name || "the writer"}
        </p>
      </section>

      {recovering && (
        <InlineMessage tone="info" title="Finishing your payment">
          Your payment went through. Confirming it with our servers now — this only takes a moment.
        </InlineMessage>
      )}

      {!recovering && pendingCharge && !success && (
        <InlineMessage
          tone="warning"
          title="A payment on this device was never confirmed"
          onRetry={checkout.retryPendingCharge}
          retryLabel="Confirm it now"
        >
          You were charged for this screenplay but the confirmation did not reach us. Nothing is
          charged twice — confirming again finishes the unlock.
        </InlineMessage>
      )}

      {success && (
        <section className="ckm-checkout__success">
          <InlineMessage tone="success" title="The screenplay is unlocked">
            {success.message}
            {success.invoiceNumber ? ` Invoice ${success.invoiceNumber} has been generated.` : ""}
          </InlineMessage>

          <div className="ckm-checkout__success-actions">
            <Button variant="primary" fullWidth to={projectPath}>Read the screenplay</Button>
            {success.invoice?._id && (
              <Button
                variant="secondary"
                fullWidth
                icon="receipt_long"
                pending={checkout.documentBusy === "invoice-download"}
                pendingLabel="Preparing the invoice…"
                onClick={takeInvoice}
              >
                Download the invoice
              </Button>
            )}
            {success.purchaseRequestId && (
              <Button
                variant="secondary"
                fullWidth
                icon="description"
                pending={checkout.documentBusy === "terms"}
                pendingLabel="Preparing the document…"
                onClick={takeAcceptedTerms}
              >
                Download the accepted terms
              </Button>
            )}
          </div>

          {has(documentError) && <InlineMessage tone="warning">{documentError}</InlineMessage>}
        </section>
      )}

      {!success && (
        <>
          <section className="ckm-checkout__panel" aria-labelledby="ckm-checkout-amount">
            <h2 className="ckm-checkout__panel-title" id="ckm-checkout-amount">What you pay</h2>
            <dl className="ckm-checkout__amount">
              {amountRows.map((row) => (
                <div key={row.key} className="ckm-checkout__amount-row" data-tone={row.tone}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="ckm-checkout__note">{checkout.breakdown?.taxMinor > 0 ? AMOUNT_NOTE_TAXED : AMOUNT_NOTE}</p>
            {askBilling && <BillingSection details={billingDetails} />}
            {has(chargeLine) && <p className="ckm-checkout__note">{chargeLine}</p>}
            {standing.id === CHECKOUT_STANDING.PAYABLE && has(standing.window?.note) && (
              <p className="ckm-checkout__deadline">{standing.window.note}</p>
            )}
          </section>

          <section className="ckm-checkout__panel" aria-labelledby="ckm-checkout-rights">
            <h2 className="ckm-checkout__panel-title" id="ckm-checkout-rights">What you are buying</h2>
            <dl className="ckm-checkout__terms">
              {rightsRows.map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="ckm-checkout__warning">{EXCLUSIVITY_WARNING}</p>
          </section>

          <section className="ckm-checkout__panel" aria-labelledby="ckm-checkout-terms">
            <h2 className="ckm-checkout__panel-title" id="ckm-checkout-terms">What you are agreeing to</h2>
            {termsPanels.map((panel) => (
              <article className="ckm-checkout__document" key={panel.key}>
                <h3 className="ckm-checkout__document-title">{panel.title}</h3>
                <p className="ckm-checkout__document-body">{panel.body}</p>
                {has(panel.to) && (
                  <a
                    className="ckm-checkout__document-link"
                    href={panel.to}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {panel.linkLabel}
                  </a>
                )}
              </article>
            ))}
          </section>

          {standing.canPay && (
            <section className="ckm-checkout__panel" aria-labelledby="ckm-checkout-accept">
              <h2 className="ckm-checkout__panel-title" id="ckm-checkout-accept">Confirm</h2>
              <div className="ckm-checkout__acceptances">
                {acceptanceRows.map((row) => (
                  <Checkbox
                    key={row.key}
                    label={row.label}
                    checked={Boolean(checkout.acceptances[row.key])}
                    onChange={(event) => checkout.setAcceptance(row.key, event.target.checked)}
                  />
                ))}
              </div>
            </section>
          )}

          {has(checkout.error) && (
            <InlineMessage tone="error" title="This payment did not go ahead">
              {checkout.error}
            </InlineMessage>
          )}
        </>
      )}
    </>,
    footer,
  );
}
