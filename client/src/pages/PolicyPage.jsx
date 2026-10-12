import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, ChevronRight } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { COMPANY, COPYRIGHT_LINE } from "../constants/company";
import policyData from "../data/legalText.json";

const LAST_UPDATED = "July 22, 2026";
const EFFECTIVE_DATE = "July 22, 2026";

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

export default function PrivacyPolicy() {
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
      {/* Nav */}
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
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-red-900/10 border border-red-900/20">
              <ShieldCheck className="w-6 h-6 text-red-900" />
            </div>
            <span className="text-xs font-semibold text-red-900 uppercase tracking-widest">
              Legal
            </span>
          </div>
          <h1 className="text-4xl font-bold text-black mb-4">Privacy Policy</h1>
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
            Ckript ("Ckript," "we," "our," or "us") is committed to handling personal
            information responsibly and transparently. This Privacy Policy describes what
            information we collect, why we collect it, how we use and disclose it, and the
            choices available to you when you use our platform.
          </p>
        </motion.div>

        {/* Quick Nav */}
        <motion.nav
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mb-12 p-5 rounded-xl bg-gray-50 border border-gray-200"
        >
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">
            Contents
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 h-64 overflow-y-auto pr-2 custom-scrollbar">
            {policyData.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-sm text-gray-700 hover:text-red-900 transition flex items-center gap-1.5 truncate"
                >
                  <ChevronRight className="w-3 h-3 text-red-900/50 shrink-0" />
                  <span className="truncate">{s.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </motion.nav>

        {/* Sections */}
        <div className="space-y-12">
          {policyData.map((section) => (
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
                {section.content?.map((block, bi) => {
                  if (block.type === 'paragraph') {
                    return <p key={bi} className="text-gray-700 text-sm leading-relaxed">{block.text}</p>;
                  }
                  if (block.type === 'list') {
                    return (
                      <ul key={bi} className="space-y-0.5 mb-4 pl-1">
                        {block.items.map((item, ii) => (
                          <li key={ii} className="flex items-start gap-2.5 text-sm text-gray-700">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-900/70 shrink-0" />
                            <span className="leading-relaxed">{item.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, "").trim()}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  return null;
                })}
              </div>
            </motion.section>
          ))}
        </div>

        {/* Statutory corporate disclosure — the entity behind this policy. */}
        <div className="mt-16 pt-8 border-t border-gray-200 text-[12.5px] leading-relaxed text-gray-500">
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-gray-400">Corporate Information</div>
          <p><span className="font-semibold text-gray-600">Legal Entity:</span> {COMPANY.legalName} <span className="mx-2 opacity-40">|</span> <span className="font-semibold text-gray-600">CIN:</span> {COMPANY.cin}</p>
          <p><span className="font-semibold text-gray-600">Registered Office:</span> {COMPANY.registeredOffice}</p>
          <p><span className="font-semibold text-gray-600">Contact:</span> <a href={`mailto:${COMPANY.email}`} className="underline underline-offset-2 hover:text-gray-700">{COMPANY.email}</a></p>
        </div>

        {/* Footer nav */}
        <div className="mt-8 pt-8 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4 text-sm text-gray-500">
          <span>{COPYRIGHT_LINE}</span>
          <div className="flex gap-6">
            <Link to="/terms-of-service" className="hover:text-red-900 transition">
              Terms of Service
            </Link>
            <Link to="/refund-policy" className="hover:text-red-900 transition">
              Refund Policy
            </Link>
            <Link to="/" className="hover:text-red-900 transition">
              Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

