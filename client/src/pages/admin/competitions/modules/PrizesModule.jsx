import React, { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { adminApi } from "../../dashboardShared";

/**
 * Prizes — what the platform GRANTS when results are declared, and what the pages promise.
 *
 * These used to be two unrelated things. The lists here were free text that only the competition
 * page and the entrant dashboard rendered, while the declare flow granted a fixed set — Gold for the
 * winner, Silver for the runner-up, a badge for a special award — whatever had been typed. An admin
 * could write "Platinum plan" and the winner still got Gold; the Hall of Fame then showed the real
 * grants beside a page that promised something else.
 *
 * Now each placing has a grant the server actually delivers (a plan and its length, featured
 * placement, an AI trailer, a cash amount) plus free-text extras for what the platform does not
 * deliver. server/utils/competitionRewards.js sanitises what is saved and composes the sentences
 * every public page prints, grants first; `describeGrant` below mirrors that wording so the preview
 * here reads the same. Cash is never paid by the platform: it is recorded in Finance as owed and
 * worded everywhere as paid by Ckript directly.
 *
 * Badges are automatic, but their ARTWORK is the admin's: one image per badge kind, and optionally
 * one per special award, stamped onto the badge when it is awarded.
 *
 * `prizes.special` titles double as the declare-results suggestions, so a declared "Best Dialogue"
 * is spelled the way it was advertised — and carries whatever was configured under that title.
 */

// Mirrors DEFAULT_GRANTS on the server. The server sanitises whatever is saved; this only fills a
// form that has nothing stored yet.
const DEFAULT_GRANTS = {
  winner: { enabled: true, plan: "gold", planDays: 30, featured: true, aiTrailer: true, cashMinor: 0, cashCurrency: "INR" },
  runnerUp: { enabled: true, plan: "silver", planDays: 30, featured: true, aiTrailer: false, cashMinor: 0, cashCurrency: "INR" },
  secondRunnerUp: { enabled: false, plan: "silver", planDays: 14, featured: false, aiTrailer: false, cashMinor: 0, cashCurrency: "INR" },
};
const DEFAULT_SPECIAL = { plan: "none", planDays: 30, featured: false, cashMinor: 0, cashCurrency: "INR", badgeUrl: "" };

const PLACINGS = [
  { key: "winner", title: "Winner", hint: "Granted to the winner the moment results are declared." },
  { key: "runnerUp", title: "Runner-Up", hint: "Granted to the runner-up, if you pick one when declaring." },
  { key: "secondRunnerUp", title: "Second Runner-Up", hint: "An optional third placing. Nothing is promised or granted unless it is switched on here." },
];

// Mirrors isPlatformDeliverableLine on the server: a typed line that names a plan, a trailer, a
// badge, a featured placement or a bare amount is the grant's job and is not printed beside it.
const PLATFORM_LINE = [
  /\b(subscription|membership|plan)\b/i,
  /\btrailer\b/i,
  /\bbadge\b/i,
  /featured placement/i,
  /^(?:cash prize|(?:inr|usd|rs\.?|₹|\$)\s?[\d,]+(?:\.\d+)?(?:\s*(?:cash(?:\s*prize)?|prize))?)$/i,
];
const isPlatformLine = (line) => PLATFORM_LINE.some((re) => re.test(String(line || "").trim()));
const extrasToPrint = (items) => items.map((s) => String(s || "").trim()).filter((s) => s && !isPlatformLine(s));

const SYMBOL = { INR: "₹", USD: "$" };
const formatCash = (minor, currency) =>
  `${SYMBOL[currency] || `${currency} `}${(Number(minor || 0) / 100).toLocaleString(currency === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 2 })}`;

/** The same sentences the server composes for the public pages, so this preview cannot lie. */
const describeGrant = (grant, badgeLabel) => {
  const lines = [];
  if (Number(grant.cashMinor) > 0) lines.push(`${formatCash(grant.cashMinor, grant.cashCurrency)} cash prize, paid directly by Ckript`);
  if (grant.plan && grant.plan !== "none") lines.push(`${grant.plan === "gold" ? "Gold" : "Silver"} plan for ${grant.planDays} day${Number(grant.planDays) === 1 ? "" : "s"}`);
  if (grant.featured) lines.push("Featured placement when you publish your script");
  if (grant.aiTrailer) lines.push("AI trailer for your script");
  if (badgeLabel) lines.push(`${badgeLabel} badge`);
  return lines;
};

const field = "px-3 py-2 bg-[#fbfbfa] border border-[#e4e2e0] rounded-lg text-sm focus:outline-none focus:border-[#111]";
const label = "block text-xs font-semibold uppercase tracking-wider text-[#666] mb-1";

// The same upload every other editor module uses for its images.
const uploadImage = async (file) => {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await adminApi.post("/admin/competitions/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
  return data.url;
};

/** One badge's artwork: preview, upload or paste, remove. */
function BadgeSlot({ title, hint, value, onChange, idPrefix }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      onChange(await uploadImage(file));
    } catch {
      alert("Failed to upload the badge image.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#eee9e2] p-3" data-badge-slot={idPrefix}>
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[#eee9e2] bg-[#fbfaf7] flex items-center justify-center">
        {value ? <img src={value} alt="" className="h-full w-full object-contain" /> : <span className="text-[10px] uppercase tracking-wider text-[#a39d92]">none</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#111]">{title}</p>
        {hint ? <p className="text-xs text-[#888]">{hint}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="px-3 py-1.5 text-xs font-semibold text-[#111] border border-[#e4e2e0] rounded-lg hover:bg-[#f4f2ef] transition-colors disabled:opacity-50">
            {busy ? "Uploading…" : value ? "Replace image" : "Upload image"}
          </button>
          <input
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="or paste an image URL"
            aria-label={`${title} image URL`}
            className={`${field} flex-1 min-w-[180px] text-xs`}
          />
          {value ? <button type="button" onClick={() => onChange("")} className="text-xs text-[#999] hover:text-red-600 transition-colors">Remove</button> : null}
        </div>
      </div>
    </div>
  );
}

/** The controls for one grant: plan + days, placements, cash. Shared by placings and special awards. */
function GrantFields({ grant, onChange, allowTrailer = true, idPrefix }) {
  const set = (key, value) => onChange({ ...grant, [key]: value });
  const noPlan = !grant.plan || grant.plan === "none";
  return (
    <div className="grid grid-cols-12 gap-3 items-end">
      <div className="col-span-4">
        <label className={label} htmlFor={`${idPrefix}-plan`}>Plan</label>
        <select id={`${idPrefix}-plan`} value={grant.plan || "none"} onChange={(e) => set("plan", e.target.value)} className={`${field} w-full`}>
          <option value="none">No plan</option>
          <option value="silver">Silver</option>
          <option value="gold">Gold</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className={label} htmlFor={`${idPrefix}-days`}>Days</label>
        <input
          id={`${idPrefix}-days`}
          type="number" min="1" max="365"
          value={grant.planDays ?? 30}
          disabled={noPlan}
          onChange={(e) => set("planDays", e.target.value === "" ? "" : Number(e.target.value))}
          className={`${field} w-full disabled:opacity-40`}
        />
      </div>
      <div className="col-span-3">
        <label className={label} htmlFor={`${idPrefix}-cash`}>Cash prize</label>
        <input
          id={`${idPrefix}-cash`}
          type="number" min="0" step="1"
          value={Number(grant.cashMinor || 0) / 100 || ""}
          placeholder="0"
          onChange={(e) => set("cashMinor", Math.max(0, Math.round(Number(e.target.value || 0) * 100)))}
          className={`${field} w-full`}
        />
      </div>
      <div className="col-span-3">
        <label className={label} htmlFor={`${idPrefix}-currency`}>Currency</label>
        <select id={`${idPrefix}-currency`} value={grant.cashCurrency || "INR"} onChange={(e) => set("cashCurrency", e.target.value)} className={`${field} w-full`}>
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div className="col-span-12 flex flex-wrap gap-5 pt-1">
        <label className="inline-flex items-center gap-2 text-sm text-[#333]">
          <input type="checkbox" checked={Boolean(grant.featured)} onChange={(e) => set("featured", e.target.checked)} />
          Featured placement when they publish
        </label>
        {allowTrailer ? (
          <label className="inline-flex items-center gap-2 text-sm text-[#333]">
            <input type="checkbox" checked={Boolean(grant.aiTrailer)} onChange={(e) => set("aiTrailer", e.target.checked)} />
            AI trailer for their script
          </label>
        ) : null}
      </div>
    </div>
  );
}

/** One list of free-text lines — the prizes the platform does not deliver. */
function ExtraLines({ items, onChange, placeholder }) {
  const set = (index, value) => {
    const next = [...items];
    next[index] = value;
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((line, i) => (
        <div key={i} className="flex items-center gap-3">
          <input value={line} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} className={`${field} flex-1`} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`} className="p-2 text-[#999] hover:text-red-600 transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-[#111] border border-[#e4e2e0] rounded-lg hover:bg-[#f4f2ef] transition-colors">
        <Plus size={14} />
        Add a line
      </button>
    </div>
  );
}

function Preview({ lines }) {
  return (
    <div className="rounded-xl bg-[#fbfaf7] border border-[#eee9e2] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#8a857d]">What the page will say</p>
      {lines.length ? (
        <ul className="mt-2 space-y-1 text-sm text-[#333]">
          {lines.map((line, i) => <li key={i}>• {line}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[#888] italic">Nothing — this tier is switched off.</p>
      )}
    </div>
  );
}

export default function PrizesModule({ data, onChange }) {
  const prizes = data.prizes || {};
  const grants = { ...DEFAULT_GRANTS, ...(prizes.grants || {}) };
  const special = prizes.special || [];
  const badgeImages = data.badgeImages || {};
  const secondRunnerUpOn = Boolean({ ...DEFAULT_GRANTS.secondRunnerUp, ...(grants.secondRunnerUp || {}) }.enabled);

  const setPrizes = (patch) => onChange("prizes", { ...prizes, ...patch });
  const setGrant = (placing, grant) => setPrizes({ grants: { ...grants, [placing]: grant } });
  const setSpecial = (index, patch) => {
    const next = [...special];
    next[index] = { ...DEFAULT_SPECIAL, ...next[index], ...patch };
    setPrizes({ special: next });
  };
  const setBadge = (kind, url) => onChange("badgeImages", { ...badgeImages, [kind]: url });

  const tiers = data.referralTiers || [];
  const setTierField = (index, key, value) => {
    const next = [...tiers];
    next[index] = { ...next[index], [key]: value };
    onChange("referralTiers", next);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* The headline figure on cards and the hub — free text, not a number. */}
      <div className="bg-white rounded-2xl p-8 border border-[#eaeaea] shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-serif font-bold text-[#111]">Prize Pool</h2>
          <p className="text-sm text-[#666] mt-1">
            The headline shown on competition cards (e.g. "$50k + Industry Features").
          </p>
        </div>
        <input
          type="text"
          value={data.prizePool || ""}
          onChange={(e) => onChange("prizePool", e.target.value)}
          placeholder="e.g. $50,000 + Producer Meetings"
          className="w-full px-4 py-3 bg-[#fbfbfa] border border-[#e4e2e0] rounded-xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#111]"
        />
      </div>

      <div className="rounded-xl bg-[#fdf5f3] border border-[#f2cdc5] px-5 py-4 text-sm text-[#6d2619]">
        What you set here is what declaring results grants — the plan, its length, the placements and the badge are
        applied automatically to the account of each placed writer. A cash prize is <b>not</b> paid by the platform:
        it is recorded in Finance as owed and paid by Ckript directly.
      </div>

      {PLACINGS.map(({ key, title, hint }) => {
        const grant = { ...DEFAULT_GRANTS[key], ...(grants[key] || {}) };
        const optional = key === "secondRunnerUp";
        const on = optional ? Boolean(grant.enabled) : true;
        const extras = prizes[key] || [];
        return (
          <div key={key} className="bg-white rounded-2xl p-8 border border-[#eaeaea] shadow-sm space-y-5">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h2 className="text-xl font-serif font-bold text-[#111]">{title}</h2>
                <p className="text-sm text-[#666] mt-1">{hint}</p>
              </div>
              {optional ? (
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#111] whitespace-nowrap">
                  <input type="checkbox" checked={on} onChange={(e) => setGrant(key, { ...grant, enabled: e.target.checked })} />
                  Award a second runner-up
                </label>
              ) : null}
            </div>
            {on ? (
              <>
                <GrantFields grant={grant} onChange={(next) => setGrant(key, next)} idPrefix={`prize-${key}`} />
                <div>
                  <p className={label}>Other prizes you deliver yourself</p>
                  <p className="text-xs text-[#888] mb-2">Producer meetings, a masterclass, a screening — anything the platform cannot grant on its own.</p>
                  <ExtraLines items={extras} onChange={(v) => setPrizes({ [key]: v })} placeholder='e.g. "A producer meeting with North Star Films"' />
                </div>
                <Preview lines={[...describeGrant(grant, title), ...extrasToPrint(extras)]} />
              </>
            ) : (
              <Preview lines={[]} />
            )}
          </div>
        );
      })}

      {/* Named awards. These titles double as the declare-results suggestions, which is what keeps a
          declared "Best Dialogue" spelled the way it was advertised — and what lets the declare flow
          find the grant configured under that title. */}
      <div className="bg-white rounded-2xl p-8 border border-[#eaeaea] shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-serif font-bold text-[#111]">Special Awards</h2>
            <p className="text-sm text-[#666] mt-1">
              Named category awards. Each carries its badge; add a plan, a placement or cash if the award should.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPrizes({ special: [...special, { title: "", description: "", ...DEFAULT_SPECIAL }] })}
            className="flex items-center gap-2 px-4 py-2 bg-[#111] hover:bg-[#333] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Award
          </button>
        </div>
        <div className="space-y-5">
          {special.length === 0 ? (
            <p className="text-sm text-[#888] italic">No special awards yet.</p>
          ) : special.map((award, i) => {
            const row = { ...DEFAULT_SPECIAL, ...award };
            return (
              <div key={i} className="rounded-xl border border-[#eee9e2] p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <input
                    value={row.title || ""}
                    onChange={(e) => setSpecial(i, { title: e.target.value })}
                    placeholder='Title — e.g. "Best Dialogue"'
                    className={`${field} w-2/5 font-semibold`}
                  />
                  <input
                    value={row.description || ""}
                    onChange={(e) => setSpecial(i, { description: e.target.value })}
                    placeholder="What it recognises (optional)"
                    className={`${field} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => setPrizes({ special: special.filter((_, j) => j !== i) })}
                    aria-label={`Remove award ${i + 1}`}
                    className="p-2 text-[#999] hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <GrantFields grant={row} onChange={(next) => setSpecial(i, next)} allowTrailer={false} idPrefix={`special-${i}`} />
                <BadgeSlot
                  title="Badge image for this award"
                  hint="Optional. Without one, the shared special-award image below is used."
                  value={row.badgeUrl}
                  onChange={(v) => setSpecial(i, { badgeUrl: v })}
                  idPrefix={`special-badge-${i}`}
                />
                <Preview lines={describeGrant(row, row.title || "Special award")} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Badge artwork. The badges themselves are automatic — a placing is its badge — but the image
          each one carries is the admin's: uploaded here, stamped onto the badge when it is awarded,
          shown on the writer's profile, in the Hall of Fame and on the results page. */}
      <div className="bg-white rounded-2xl p-8 border border-[#eaeaea] shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-serif font-bold text-[#111]">Badge Images</h2>
          <p className="text-sm text-[#666] mt-1">
            Your own artwork for each badge. A badge with no image is shown as a text chip. Square images look best.
          </p>
        </div>
        <div className="space-y-3">
          <BadgeSlot title="Winner badge" value={badgeImages.winner} onChange={(v) => setBadge("winner", v)} idPrefix="badge-winner" />
          <BadgeSlot title="Runner-Up badge" value={badgeImages.runnerUp} onChange={(v) => setBadge("runnerUp", v)} idPrefix="badge-runnerUp" />
          {secondRunnerUpOn ? (
            <BadgeSlot title="Second Runner-Up badge" value={badgeImages.secondRunnerUp} onChange={(v) => setBadge("secondRunnerUp", v)} idPrefix="badge-secondRunnerUp" />
          ) : null}
          <BadgeSlot title="Special award badge" hint="Used by any special award that has no image of its own." value={badgeImages.special} onChange={(v) => setBadge("special", v)} idPrefix="badge-special" />
          <BadgeSlot title="Participant badge" hint="Everyone who submitted a script." value={badgeImages.participant} onChange={(v) => setBadge("participant", v)} idPrefix="badge-participant" />
        </div>
      </div>

      {/* Referral rewards. The server side of this is fully wired — sanitizeReferralTiers,
          storage, the grant loop at declare-results and its idempotency — but the new console
          shipped without an editor, so every competition silently fell back to the module defaults
          the copy below calls a fallback rather than a policy. Lives here because rewards do. */}
      <div className="bg-white rounded-2xl p-8 border border-[#eaeaea] shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 className="text-xl font-serif font-bold text-[#111]">Referral Rewards</h2>
            <p className="text-sm text-[#666] mt-1">
              Writers who bring other writers in earn these.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange("referralTiers", [...tiers, { count: "", id: "", label: "", days: "" }])}
            className="flex items-center gap-2 px-4 py-2 bg-[#111] hover:bg-[#333] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Tier
          </button>
        </div>
        <p className="text-xs text-[#888] mb-4">
          Leave empty to use the platform defaults (5 &rarr; 30 days Silver, 12 &rarr; Gold, 20 &rarr; AI Trailer). The ID becomes the reward&rsquo;s permanent key &mdash;
          changing it after results are declared will not re-grant anything.
        </p>
        <div className="space-y-2">
          {tiers.length === 0 ? (
            <p className="text-sm text-[#888] italic">Using platform defaults.</p>
          ) : tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input
                type="number" min="1"
                value={tier?.count ?? ""}
                onChange={(e) => setTierField(i, "count", e.target.value)}
                placeholder="Referrals"
                className={`col-span-2 ${field}`}
              />
              <input
                value={tier?.id || ""}
                onChange={(e) => setTierField(i, "id", e.target.value)}
                placeholder="Reward ID (e.g. challenge_referral_gold)"
                className={`col-span-5 ${field}`}
              />
              <input
                value={tier?.label || ""}
                onChange={(e) => setTierField(i, "label", e.target.value)}
                placeholder="Label"
                className={`col-span-3 ${field}`}
              />
              <input
                type="number" min="0"
                value={tier?.days ?? ""}
                onChange={(e) => setTierField(i, "days", e.target.value)}
                placeholder="Days"
                className={`col-span-1 ${field}`}
              />
              <button
                type="button"
                onClick={() => onChange("referralTiers", tiers.filter((_, j) => j !== i))}
                aria-label={`Remove tier ${i + 1}`}
                className="col-span-1 p-2 text-[#999] hover:text-red-600 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
