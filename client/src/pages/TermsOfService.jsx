import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { FileText, ChevronRight, CheckCircle2, ShieldCheck, Scale, ScrollText, Calendar } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { COMPANY, COPYRIGHT_LINE } from "../constants/company";
import { termsData } from "../data/termsData";

export default function TermsOfService() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(termsData[0]?.id || "");
  const observerRefs = useRef({});

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );

    Object.values(observerRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: "smooth" });
      setActiveSection(id);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black selection:bg-red-900/30 font-sans">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <BrandLogo className="h-8 sm:h-9 w-auto" />
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-red-900 hover:bg-red-50 transition-all"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-white border-b border-gray-200">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-red-50/50 via-white to-white pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-900/10 border border-red-900/20 mb-6">
              <ShieldCheck className="w-4 h-4 text-red-900" />
              <span className="text-xs font-bold text-red-900 uppercase tracking-widest">
                Legal Hub
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-black mb-6 tracking-tight">
              Terms & Conditions
            </h1>
            <p className="text-lg sm:text-xl text-gray-700 leading-relaxed mb-8 max-w-2xl">
              Welcome to Ckript. Please read these terms carefully, as they govern your access to and use of our platform, services, and community.
            </p>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                  <CheckCircle2 className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Version</p>
                  <p className="text-gray-800 font-medium">1.0</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                  <ScrollText className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Effective Date</p>
                  <p className="text-gray-800 font-medium">July 29, 2026</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                  <Calendar className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Last Updated</p>
                  <p className="text-gray-800 font-medium">July 29, 2026</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* Sticky Sidebar (Desktop only) */}
          <aside className="hidden lg:block w-72 shrink-0 relative">
            <div className="sticky top-28 max-h-[calc(100vh-140px)] overflow-y-auto pr-4 pb-12 custom-scrollbar">
              <div className="mb-4 flex items-center gap-2 px-1">
                <Scale className="w-4 h-4 text-gray-400" />
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Table of Contents
                </h3>
              </div>
              <ul className="space-y-1 border-l border-gray-200">
                {termsData.map((section) => (
                  <li key={section.id}>
                    <button
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full text-left py-2 px-4 text-sm transition-all border-l-2 -ml-[1px] ${
                        activeSection === section.id
                          ? "border-red-900 text-red-900 font-semibold bg-red-900/5 rounded-r-lg"
                          : "border-transparent text-gray-600 hover:border-gray-300 hover:text-black"
                      }`}
                    >
                      <span className="line-clamp-2">{section.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 max-w-4xl min-w-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-10 lg:p-12">
              {termsData.map((section, index) => (
                <motion.section
                  key={section.id}
                  id={section.id}
                  ref={(el) => (observerRefs.current[section.id] = el)}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10%" }}
                  className={`scroll-mt-32 ${index !== 0 ? "mt-12 pt-12 border-t border-gray-100" : ""}`}
                >
                  <h2 className="text-xl sm:text-2xl font-bold text-black mb-6 flex items-baseline gap-3">
                    <span className="text-red-900 font-black">{section.title.split('.')[0]}.</span>
                    <span>{section.title.substring(section.title.indexOf('.') + 1).trim()}</span>
                  </h2>

                  <div className="space-y-4">
                    {section.content?.map((block, i) => {
                      if (block.type === "paragraph") {
                        return (
                          <p key={i} className="text-gray-700 text-sm sm:text-base leading-relaxed">
                            {block.text}
                          </p>
                        );
                      }
                      if (block.type === "bullets") {
                        return (
                          <ul key={i} className="list-none space-y-3 mt-4 mb-6 bg-gray-50 p-5 rounded-xl border border-gray-100">
                            {block.items.map((item, j) => (
                              <li key={j} className="flex items-start gap-3 text-sm sm:text-base text-gray-700 leading-relaxed">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-900/70 mt-2 shrink-0 shadow-sm" />
                                <span>{item}</span>
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

            {/* Corporate Disclosure */}
            <div className="mt-12 pt-8 border-t border-gray-200 text-xs leading-relaxed text-gray-500 bg-gray-50 p-6 rounded-xl">
              <div className="mb-2 font-bold uppercase tracking-widest text-gray-400">Corporate Information</div>
              <p className="mb-1"><span className="font-semibold text-gray-700">Legal Entity:</span> {COMPANY.legalName} <span className="mx-2 text-gray-300">|</span> <span className="font-semibold text-gray-700">CIN:</span> {COMPANY.cin}</p>
              <p className="mb-1"><span className="font-semibold text-gray-700">Registered Office:</span> {COMPANY.registeredOffice}</p>
              <p><span className="font-semibold text-gray-700">Contact:</span> <a href={`mailto:${COMPANY.email}`} className="text-red-900 hover:underline">{COMPANY.email}</a></p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>{COPYRIGHT_LINE}</p>
          <div className="flex gap-6 font-medium">
            <Link to="/privacy-policy" className="hover:text-red-900 transition-colors">
              Privacy Policy
            </Link>
            <Link to="/refund-policy" className="hover:text-red-900 transition-colors">
              Refund Policy
            </Link>
            <Link to="/" className="hover:text-red-900 transition-colors">
              Home
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}


