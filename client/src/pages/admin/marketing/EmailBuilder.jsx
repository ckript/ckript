import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, Image as ImageIcon, Link as LinkIcon, Mail, Type, Upload } from "lucide-react";
import { adminApi } from "../../AdminDashboard";
import { compileEmailPreviewHtml } from "./compiler/emailCompiler";

const generateId = () => Math.random().toString(36).slice(2, 11);

/**
 * The starting document. No stock photo: the old default opened every campaign with an Unsplash
 * gradient that had nothing to do with the platform, and it went out that way. A cover is still one
 * upload away in the Cover Image section.
 */
const defaultBlocks = () => [
  { id: generateId(), type: "HeroImage", imageUrl: "" },
  {
    id: generateId(),
    type: "Heading",
    eyebrow: "From Ckript",
    text: "A note from the desk",
    subtitle: "What is new on the platform, and why it matters to your work.",
    align: "center",
  },
  {
    id: generateId(),
    type: "Text",
    content:
      "Write the message here. A good email says one thing well and gets out of the way.\n\nLeave a blank line between paragraphs and they are set apart in the mail.",
    align: "left",
  },
  { id: generateId(), type: "CTA", text: "Open Ckript", url: "https://ckript.com", align: "center" },
  { id: generateId(), type: "Footer" },
];

// Admin console tokens (client/src/pages/admin/ui/tokens.css): this chrome is an admin control and
// follows the console's light/dark theme. The mail inside the frame does not — it is the document.
const sectionClass = "space-y-4 p-5 rounded-xl bg-[var(--ad-surface)] border border-[var(--ad-line)]";
const sectionTitleClass = "flex items-center gap-2 text-sm font-semibold mb-2 text-[var(--ad-ink-2)]";
const labelClass = "block text-xs font-medium mb-1.5 uppercase tracking-wider text-[var(--ad-ink-3)]";
const inputClass =
  "w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors bg-[var(--ad-surface-2)] border border-[var(--ad-line-2)] text-[var(--ad-ink)] placeholder:text-[var(--ad-ink-3)] focus:bg-[var(--ad-surface)] focus:border-[var(--ad-accent)]";

export default function EmailBuilder({ blocks, setBlocks }) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);
  const frameRef = useRef(null);
  const [frameHeight, setFrameHeight] = useState(760);

  useEffect(() => {
    if (!blocks || blocks.length === 0) setBlocks(defaultBlocks());
  }, [blocks, setBlocks]);

  const updateBlock = (type, key, value) => {
    setBlocks((prev) => prev.map((b) => (b.type === type ? { ...b, [key]: value } : b)));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append("file", file);

      const { data } = await adminApi.post("/messages/upload", formData);
      if (data?.fileUrl) {
        updateBlock("HeroImage", "imageUrl", data.fileUrl);
      }
    } catch (error) {
      console.error("Image upload error:", error);
      alert(error?.response?.data?.message || "Failed to upload image.");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const heroBlock = blocks?.find((b) => b.type === "HeroImage") || {};
  const headingBlock = blocks?.find((b) => b.type === "Heading") || {};
  const textBlock = blocks?.find((b) => b.type === "Text") || {};
  const ctaBlock = blocks?.find((b) => b.type === "CTA") || {};

  // The preview IS the document: the same compiler output that is mailed, with the two personal
  // footer links made inert. Nothing is drawn twice here, so nothing can drift from what is sent.
  const previewHtml = useMemo(() => compileEmailPreviewHtml(blocks || []), [blocks]);

  const fitFrame = () => {
    try {
      const doc = frameRef.current?.contentDocument;
      const height = doc?.documentElement?.scrollHeight || doc?.body?.scrollHeight || 0;
      if (height) setFrameHeight(Math.max(520, height + 8));
    } catch {
      // A sandboxed frame may refuse the read; the last known height stands.
    }
  };

  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="flex flex-col md:flex-row h-auto min-h-[600px] rounded-2xl overflow-hidden bg-[var(--ad-surface)] border border-[var(--ad-line)]">
      {/* LEFT: EDITOR FORM */}
      <div className="w-full md:w-5/12 flex flex-col bg-[var(--ad-surface-2)] border-b md:border-b-0 md:border-r border-[var(--ad-line)]">
        <div className="p-6 flex items-center gap-3 bg-[var(--ad-surface)] border-b border-[var(--ad-line)]">
          <div className="p-2 rounded-lg bg-[var(--ad-accent-soft)] text-[var(--ad-accent)]">
            <Mail size={20} />
          </div>
          <div>
            <h3 className="font-bold text-[var(--ad-ink)]">Message Content</h3>
            <p className="text-xs text-[var(--ad-ink-3)]">Edit the fields below to update your email</p>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          {/* Headers */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <Type size={16} className="text-[var(--ad-ink-3)]" /> Headers
            </div>
            <div>
              <label className={labelClass}>
                Eyebrow <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={headingBlock.eyebrow || ""}
                onChange={(e) => updateBlock("Heading", "eyebrow", e.target.value)}
                className={inputClass}
                placeholder="From Ckript"
                maxLength={40}
              />
            </div>
            <div>
              <label className={labelClass}>Main Heading</label>
              <input
                type="text"
                value={headingBlock.text || ""}
                onChange={(e) => updateBlock("Heading", "text", e.target.value)}
                className={inputClass}
                placeholder="Enter heading..."
              />
            </div>
            <div>
              <label className={labelClass}>Subtitle</label>
              <input
                type="text"
                value={headingBlock.subtitle || ""}
                onChange={(e) => updateBlock("Heading", "subtitle", e.target.value)}
                className={inputClass}
                placeholder="Enter subtitle..."
              />
            </div>
          </div>

          {/* Body */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <AlignLeft size={16} className="text-[var(--ad-ink-3)]" /> Body Text
            </div>
            <div>
              <label className={labelClass}>Message</label>
              <textarea
                value={textBlock.content || ""}
                onChange={(e) => updateBlock("Text", "content", e.target.value)}
                className={`${inputClass} min-h-[140px] resize-y py-3`}
                placeholder="Write your email content here..."
              />
            </div>
          </div>

          {/* Cover image */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <ImageIcon size={16} className="text-[var(--ad-ink-3)]" /> Cover Image
            </div>
            <div>
              <label className={labelClass}>Image URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={heroBlock.imageUrl || ""}
                  onChange={(e) => updateBlock("HeroImage", "imageUrl", e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="https://..."
                />
                <button
                  type="button"
                  disabled={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center disabled:opacity-50 bg-[var(--ad-surface-3)] text-[var(--ad-ink-2)] border border-[var(--ad-line-2)] hover:bg-[var(--ad-line)]"
                  title="Upload Image"
                >
                  <Upload size={18} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
              </div>
            </div>
          </div>

          {/* Call to action */}
          <div className={sectionClass}>
            <div className={sectionTitleClass}>
              <LinkIcon size={16} className="text-[var(--ad-ink-3)]" /> Call to Action
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Button Text</label>
                <input
                  type="text"
                  value={ctaBlock.text || ""}
                  onChange={(e) => updateBlock("CTA", "text", e.target.value)}
                  className={inputClass}
                  placeholder="Open Ckript"
                />
              </div>
              <div>
                <label className={labelClass}>Button Link</label>
                <input
                  type="url"
                  value={ctaBlock.url || ""}
                  onChange={(e) => updateBlock("CTA", "url", e.target.value)}
                  className={inputClass}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: LIVE PREVIEW — the compiled document itself, in a frame */}
      <div className="w-full md:w-7/12 flex flex-col bg-[var(--ad-surface-2)]">
        <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-[var(--ad-line)] bg-[var(--ad-surface)]">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ad-ink-3)]">Live preview</span>
          <span className="text-[11px] text-[var(--ad-ink-3)]">The document the recipient receives</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <iframe
            ref={frameRef}
            title="Email preview"
            srcDoc={previewHtml}
            sandbox="allow-same-origin"
            onLoad={fitFrame}
            style={{ height: frameHeight }}
            className="block w-full border-0"
          />
        </div>
        <p className="px-5 py-3 text-[11px] leading-relaxed border-t border-[var(--ad-line)] text-[var(--ad-ink-3)] bg-[var(--ad-surface)]">
          This is the document that goes out. The Unsubscribe and Preferences links in the footer are added automatically
          to every send and personalised per recipient.
        </p>
      </div>
    </div>
  );
}
