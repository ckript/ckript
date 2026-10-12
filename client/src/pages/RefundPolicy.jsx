import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { ReceiptText, ChevronRight } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { COMPANY, COPYRIGHT_LINE } from "../constants/company";

/* The Refund & Cancellation Policy the Terms of Service (§67) incorporate by reference. Every rule here
   describes what the platform actually does — a promise added here must exist in the code first.
   Wording: "taxes", never the statutory names (see utils/taxWording.test.js). */

const LAST_UPDATED = "October 11, 2026";
const EFFECTIVE_DATE = "October 11, 2026";

const SECTIONS = [
  {
    id: "overview",
    title: "1. About this policy",
    content: [
      { type: "paragraph", text: `This Refund & Cancellation Policy applies to payments made on Ckript, the platform operated by ${COMPANY.legalName}. It forms part of our Terms of Service and is the "Refund Policy" those terms refer to.` },
      { type: "paragraph", text: "Nothing in this policy limits any right you have under applicable consumer protection law." },
    ],
  },
  {
    id: "how-refunds-work",
    title: "2. How a refund is paid",
    content: [
      {
        type: "list",
        items: [
          "Refunds go back to the payment method you paid with, through our payment partner Razorpay. Banks usually show the refund within 5–7 working days.",
          "A refund can be for the full amount or part of it.",
          "The taxes you paid on the refunded amount are refunded with it.",
          "Every refund is documented with a credit note against your original invoice. It is emailed to you and listed under Settings → Billing & invoices.",
        ],
      },
    ],
  },
  {
    id: "plans",
    title: "3. Plans and renewals",
    content: [
      { type: "paragraph", text: "Paid plans renew automatically at the end of each billing period until you cancel. Each renewal is charged at the plan's price plus taxes, and you receive an invoice for it." },
      {
        type: "list",
        items: [
          "You can cancel at any time from Settings → Plan & billing.",
          "Cancelling stops the next renewal. You keep your plan until the end of the period you have already paid for.",
          "A period that has started is not refunded in part.",
        ],
      },
    ],
  },
  {
    id: "scripts",
    title: "4. Script purchases and holds",
    content: [
      {
        type: "list",
        items: [
          "You pay for a script only after the writer approves your request. If a request is declined before you pay, nothing is charged.",
          "If a writer declines a request you have already paid for, the full amount, taxes included, is refunded.",
          "Once access to a script has been granted, the purchase is not refundable, because the script has been made available to you.",
          "A hold fee is not refundable once the hold has started.",
        ],
      },
    ],
  },
  {
    id: "consultations",
    title: "5. Consultations",
    content: [
      {
        type: "list",
        items: [
          "You can cancel a booking while it is waiting for the professional to respond. The full amount, taxes included, is refunded automatically.",
          "If the professional declines your booking, the full amount, taxes included, is refunded automatically.",
          "Once a professional has accepted a booking, it cannot be cancelled from the app. Write to us if something has gone wrong.",
        ],
      },
    ],
  },
  {
    id: "services",
    title: "6. AI trailers and other services",
    content: [
      { type: "paragraph", text: "A paid service is not refundable once it has been substantially provided. If a service you paid for is not delivered, write to us and you may request a refund." },
    ],
  },
  {
    id: "competitions",
    title: "7. Competitions and challenges",
    content: [
      { type: "paragraph", text: "Refunds of entry fees follow the rules published for each competition or challenge." },
    ],
  },
  {
    id: "failed-payments",
    title: "8. Failed, duplicate or disputed payments",
    content: [
      { type: "paragraph", text: "If money left your account but your purchase did not go through, or you were charged twice for the same thing, write to us with the payment ID shown in your bank statement or Razorpay receipt. A charge for something you did not receive is refunded in full, taxes included." },
    ],
  },
  {
    id: "other",
    title: "9. Other refunds",
    content: [
      { type: "paragraph", text: "Ckript may, at its discretion, refund a payment in full or in part in other circumstances. Such refunds are paid and documented in the same way." },
    ],
  },
  {
    id: "contact",
    title: "10. How to ask for a refund",
    content: [
      { type: "paragraph", text: `Write to ${COMPANY.supportEmail} from the email address on your account, with the invoice number or payment ID and the reason for your request.` },
    ],
  },
];

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

export default function RefundPolicy() {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <BrandLogo className="h-9 w-auto" />
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-900 transition"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-red-900/10 border border-red-900/20">
              <ReceiptText className="w-6 h-6 text-red-900" />
            </div>
            <span className="text-xs font-semibold text-red-900 uppercase tracking-widest">
              Legal
            </span>
          </div>
          <h1 className="text-4xl font-bold text-black mb-4">Refund &amp; Cancellation Policy</h1>
          <div className="flex flex-wrap gap-6 text-sm text-gray-600">
            <span>
              <span className="text-gray-500">Effective:</span>{" "}
              <span className="text-gray-700">{EFFECTIVE_DATE}</span>
            </span>
            <span>
              <span className="text-gray-500">Last updated:</span>{" "}
              <span className="text-gray-700">{LAST_UPDATED}</span>
            </span>
          </div>
          <p className="mt-6 text-gray-700 text-base leading-relaxed border-l-2 border-red-900/40 pl-4">
            When you can get your money back, how a refund reaches you, and how to cancel a plan or a booking.
          </p>
        </motion.div>

        <nav className="mb-12 p-5 rounded-xl bg-gray-50 border border-gray-200" aria-label="Contents">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">
            Contents
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-sm text-gray-700 hover:text-red-900 transition flex items-center gap-1.5"
                >
                  <ChevronRight className="w-3 h-3 text-red-900/50 shrink-0" />
                  <span>{s.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-12">
          {SECTIONS.map((section) => (
            <motion.section
              key={section.id}
              id={section.id}
              variants={itemVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              <h2 className="text-xl font-bold text-black mb-4 pb-2 border-b border-gray-200">
                {section.title}
              </h2>
              <div className="space-y-2">
                {section.content.map((block, bi) => (block.type === "list" ? (
                  <ul key={bi} className="space-y-1 mb-4 pl-1">
                    {block.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm text-gray-700">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-900/70 shrink-0" />
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p key={bi} className="text-gray-700 text-sm leading-relaxed">{block.text}</p>
                )))}
              </div>
            </motion.section>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200 text-[12.5px] leading-relaxed text-gray-500">
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-gray-400">Corporate Information</div>
          <p><span className="font-semibold text-gray-600">Legal Entity:</span> {COMPANY.legalName} <span className="mx-2 opacity-40">|</span> <span className="font-semibold text-gray-600">CIN:</span> {COMPANY.cin}</p>
          <p><span className="font-semibold text-gray-600">Registered Office:</span> {COMPANY.registeredOffice}</p>
          <p><span className="font-semibold text-gray-600">Refunds:</span> <a href={`mailto:${COMPANY.supportEmail}`} className="underline underline-offset-2 hover:text-gray-700">{COMPANY.supportEmail}</a></p>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4 text-sm text-gray-500">
          <span>{COPYRIGHT_LINE}</span>
          <div className="flex flex-wrap gap-6">
            <Link to="/terms-of-service" className="hover:text-red-900 transition">Terms of Service</Link>
            <Link to="/privacy-policy" className="hover:text-red-900 transition">Privacy Policy</Link>
            <Link to="/" className="hover:text-red-900 transition">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
