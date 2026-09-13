import api from "../../services/api";
import publicApi from "../../services/publicApi";

export const CHALLENGE_HUB_TABS = Object.freeze([
  { id: "live", label: "Live" },
  { id: "past", label: "Previous" },
  { id: "hall-of-fame", label: "Hall of Fame" },
  { id: "mine", label: "My Challenges" },
]);

export const CHALLENGE_HUB_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  FAILED: "failed",
});

const text = (value) => String(value ?? "").trim();
const items = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const failure = (cause, fallback) => ({
  ok: false,
  cancelled: cause?.code === "ERR_CANCELED",
  statusCode: Number(cause?.response?.status || 0),
  message: cause?.response?.data?.message || fallback,
  cause,
});

export function readChallengeHubTab(search = "") {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const requested = text(params.get("tab")).toLowerCase();
  return CHALLENGE_HUB_TABS.some(({ id }) => id === requested) ? requested : "live";
}

export function writeChallengeHubTab(current = "", tab = "live") {
  const params = current instanceof URLSearchParams
    ? new URLSearchParams(current)
    : new URLSearchParams(current);
  if (tab === "live") params.delete("tab");
  else params.set("tab", readChallengeHubTab(`?tab=${encodeURIComponent(tab)}`));
  return params;
}

export function normalizeChallengeHubPublic(listPayload = {}, archivePayload = {}) {
  const archive = items(archivePayload?.items);
  const archiveById = new Map(archive.map((record) => [String(record?._id || ""), record]));
  const past = items(listPayload?.past).map((record) => ({
    ...record,
    ...(archiveById.get(String(record?._id || "")) || {}),
  }));
  const honourRoll = archive
    .map((competition) => ({
      competition,
      people: [
        ...(competition?.winner ? [{ person: competition.winner, award: "winner" }] : []),
        ...(competition?.runnerUp ? [{ person: competition.runnerUp, award: "runner_up" }] : []),
        ...(competition?.secondRunnerUp ? [{ person: competition.secondRunnerUp, award: "second_runner_up" }] : []),
        ...items(competition?.special).map((person) => ({ person, award: "special" })),
      ],
    }))
    .filter(({ people }) => people.length > 0);

  return {
    live: [...items(listPayload?.live), ...items(listPayload?.upcoming)],
    past,
    archive,
    honourRoll,
    laureateCount: honourRoll.reduce((total, group) => total + group.people.length, 0),
    serverNow: listPayload?.serverNow || null,
    years: items(archivePayload?.years),
    archivePageInfo: archivePayload?.pageInfo || null,
  };
}

export function normalizeMyChallenges(payload = {}) {
  return {
    items: items(payload?.items).filter((item) => item?.entry && item?.competition),
    serverNow: payload?.serverNow || null,
  };
}

export async function loadChallengeHubPublic({ signal } = {}) {
  try {
    const [listed, completed] = await Promise.all([
      publicApi.get("/competitions/list", { signal }),
      // The hub is a preview, not the archive. Keep it compact and send visitors to the paged
      // Hall of Fame for the full permanent record.
      publicApi.get("/competitions/completed", { signal, params: { limit: 6 } }),
    ]);
    return {
      ok: true,
      data: normalizeChallengeHubPublic(listed.data, completed.data),
    };
  } catch (cause) {
    if (signal?.aborted) return { ok: false, cancelled: true };
    return failure(cause, "Could not load competitions. Please try again.");
  }
}

export async function loadMyChallenges({ signal } = {}) {
  try {
    const { data } = await api.get("/competitions/mine", { signal });
    return { ok: true, data: normalizeMyChallenges(data) };
  } catch (cause) {
    if (signal?.aborted) return { ok: false, cancelled: true };
    return failure(cause, "Could not load your challenges. Please try again.");
  }
}

export async function downloadChallengeCertificate({ competitionId, competitionName } = {}) {
  const id = text(competitionId);
  if (!id) return failure(null, "This certificate is no longer available.");
  try {
    const { data } = await api.get(`/competitions/${encodeURIComponent(id)}/certificate`, {
      params: { download: 1 },
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${text(competitionName) || "Competition"} certificate.pdf`.replace(/[\\/]/g, "-");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    return { ok: true };
  } catch (cause) {
    let message = "Could not download your certificate.";
    try {
      const body = await cause?.response?.data?.text?.();
      if (body) message = JSON.parse(body).message || message;
    } catch {
      // A non-JSON blob keeps the safe generic message.
    }
    return { ...failure(cause, message), message };
  }
}
