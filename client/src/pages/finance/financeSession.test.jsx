// @vitest-environment happy-dom
//
// Who /finance thinks you are.
//
// The bug this covers: signing in through the admin console's access code stores the session in
// sessionStorage, deliberately apart from the ordinary localStorage login. /finance asked only
// AuthContext, which never sees that, so an admin arriving from the console's Payments link was
// greeted as their own everyday account and refused entry to a page they administer. Every request
// the page made went out under the wrong token too, or none.
//
// The two halves are tested separately because they failed separately: identity decides what you are
// shown, the interceptor decides what the server is told.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Every test here imports its subject cold (and the page tests reset the module graph first), so on a
// busy machine the first transform of FinanceHome and its sections can outrun the 5s default. That
// is the import, not the assertion, timing out — give it room rather than letting it flake.
vi.setConfig({ testTimeout: 30000 });

const ADMIN ={ token: "admin-token", role: "admin", name: "Ckript Admin", email: "admin@ckript.com" };

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the admin session is what /finance identifies you by", () => {
  it("prefers the console session over whoever is signed in normally", async () => {
    const { resolveEffectiveUser } = await import("../../utils/adminSession");
    const signedIn = { role: "writer", name: "Rhea Kapoor" };

    expect(resolveEffectiveUser(signedIn)).toBe(signedIn);

    sessionStorage.setItem("admin-session", JSON.stringify(ADMIN));
    expect(resolveEffectiveUser(signedIn).role).toBe("admin");
  });

  it("falls back to the normal session, so a finance accountant is unaffected", async () => {
    const { resolveEffectiveUser } = await import("../../utils/adminSession");
    const accountant = { role: "finance", name: "Dev Mehta" };
    expect(resolveEffectiveUser(accountant)).toBe(accountant);
    expect(resolveEffectiveUser(undefined)).toBe(null);
  });

  it("treats an expired admin session as no session, and clears it", async () => {
    const { readAdminSession } = await import("../../utils/adminSession");
    sessionStorage.setItem("admin-session", JSON.stringify({ ...ADMIN, expiresAt: Date.now() - 1000 }));

    // Otherwise the console shell keeps rendering while every request behind it 401s, which reads as
    // a broken page rather than a session that ended.
    expect(readAdminSession()).toBe(null);
    expect(sessionStorage.getItem("admin-session")).toBe(null);
  });

  it("survives a malformed or tokenless session rather than throwing", async () => {
    const { readAdminSession } = await import("../../utils/adminSession");
    for (const raw of ["{not json", "null", "{}", '{"role":"admin"}', '"a string"']) {
      sessionStorage.setItem("admin-session", raw);
      expect(readAdminSession()).toBe(null);
    }
  });
});

describe("the request carries the token that matches that identity", () => {
  /** Run the instance's request interceptor without a network round trip. */
  const authorize = async (url = "/finance/payments") => {
    const { default: financeApi } = await import("../../services/financeApi");
    const handler = financeApi.interceptors.request.handlers[0].fulfilled;
    return handler({ url, headers: {} }).headers.Authorization;
  };

  it("uses the admin token when the console session is live", async () => {
    localStorage.setItem("user", JSON.stringify({ token: "user-token" }));
    sessionStorage.setItem("admin-session", JSON.stringify(ADMIN));
    expect(await authorize()).toBe("Bearer admin-token");
  });

  it("uses the normal token when there is no console session", async () => {
    localStorage.setItem("user", JSON.stringify({ token: "user-token" }));
    expect(await authorize()).toBe("Bearer user-token");
  });

  it("sends nothing rather than throwing when neither session is usable", async () => {
    localStorage.setItem("user", "{corrupt");
    expect(await authorize()).toBe(undefined);
  });

  it("covers the control endpoints too, which still live under /admin", async () => {
    // useFinanceActions posts to /admin/users/:id/grant-premium and friends. Those need the admin
    // token as much as the reads do, and they were failing for the same reason.
    sessionStorage.setItem("admin-session", JSON.stringify(ADMIN));
    expect(await authorize("/admin/users/u1/grant-premium")).toBe("Bearer admin-token");
    expect(await authorize("/invoices/i1/pdf")).toBe("Bearer admin-token");
  });
});

describe("the page itself lets that admin in", () => {
  // The tests above would all still pass if FinanceHome went back to reading AuthContext directly,
  // which is the exact line that caused the bug. This one renders the real page, so it cannot.
  const REFUSAL = "This page is for finance accounts";

  const renderPage = async () => {
    vi.resetModules();
    vi.doMock("../../services/financeApi", () => ({
      default: {
        get: vi.fn().mockResolvedValue({ data: {} }),
        post: vi.fn().mockResolvedValue({ data: {} }),
        put: vi.fn().mockResolvedValue({ data: {} }),
      },
    }));

    const [{ default: FinanceHome }, { createRoot }, { act }] = await Promise.all([
      import("./FinanceHome.jsx"),
      import("react-dom/client"),
      import("react"),
    ]);

    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<FinanceHome />));
    const text = host.textContent || "";
    await act(async () => root.unmount());
    host.remove();
    return text;
  };

  it("turns away someone with no session at all", async () => {
    expect(await renderPage()).toContain(REFUSAL);
  });

  it("admits an admin who signed in with the console access code", async () => {
    sessionStorage.setItem("admin-session", JSON.stringify(ADMIN));
    const text = await renderPage();
    expect(text).not.toContain(REFUSAL);
    expect(text).toContain("Ckript Payments");
  });
});
