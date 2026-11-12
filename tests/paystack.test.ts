import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSubaccount,
  endpointLabel,
  getPaystackBanks,
  getPaystackMode,
  initializeTransaction,
  isUsableSubaccount,
  listSettlements,
  listSettlementTransactions,
  paystackFetch,
  resolveAccount,
  updateSubaccount,
  verifyTransaction,
} from "@/lib/paystack";

const fetchMock = vi.fn();

function okResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: true, message: "ok", data }),
  };
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
  return { url, init };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_123");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("paystackFetch", () => {
  it("calls the Paystack API with auth and JSON headers", async () => {
    fetchMock.mockResolvedValue(okResponse({ hello: "world" }));

    const res = await paystackFetch("/ping");

    expect(res.data).toEqual({ hello: "world" });
    const { url, init } = lastCall();
    expect(url).toBe("https://api.paystack.co/ping");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer sk_test_123",
      "Content-Type": "application/json",
    });
  });

  it("lets caller headers override the defaults", async () => {
    fetchMock.mockResolvedValue(okResponse(null));
    await paystackFetch("/ping", { headers: { "Content-Type": "text/plain" } });
    expect(lastCall().init?.headers).toMatchObject({ "Content-Type": "text/plain" });
  });

  it("fails with status + endpoint, never echoing the response body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "invalid key",
    });
    // The message is what call sites forward to Sentry (captureError), and
    // Paystack error bodies can echo the request — including a guest email — so
    // it carries the grouped endpoint label and status only (395554a).
    const error = await paystackFetch("/ping").catch((e: unknown) => e as Error);
    expect(error.message).toBe("Paystack 401 /ping");
    expect(error.message).not.toContain("invalid key");
  });

  it("reports the same failure when the error body cannot be read", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => {
        throw new Error("stream closed");
      },
    });
    await expect(paystackFetch("/ping")).rejects.toThrow("Paystack 500 /ping");
  });

  it("groups variable path segments in the failure message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "",
    });
    await expect(paystackFetch("/transaction/verify/RL-8H2K91")).rejects.toThrow(
      "Paystack 404 /transaction/verify/:id"
    );
  });
});

describe("bank helpers", () => {
  it("returns the bank list", async () => {
    fetchMock.mockResolvedValue(okResponse([{ name: "GCB", code: "040" }]));
    await expect(getPaystackBanks()).resolves.toEqual([{ name: "GCB", code: "040" }]);
    expect(lastCall().url).toBe("https://api.paystack.co/bank?country=ghana&perPage=100");
  });

  it("returns an empty list when Paystack omits data", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: true, message: "ok" }) });
    await expect(getPaystackBanks()).resolves.toEqual([]);
  });

  it("url-encodes account resolution parameters", async () => {
    fetchMock.mockResolvedValue(okResponse({ account_name: "Ama", account_number: "01/2" }));
    await resolveAccount("01/2", "0 40");
    expect(lastCall().url).toBe(
      "https://api.paystack.co/bank/resolve?account_number=01%2F2&bank_code=0%2040"
    );
  });
});

describe("subaccounts", () => {
  it("defaults percentage_charge to 0 and allows overriding it", async () => {
    fetchMock.mockResolvedValue(okResponse({ subaccount_code: "ACCT_1" }));

    await createSubaccount({ business_name: "Inn", settlement_bank: "040", account_number: "123" });
    expect(JSON.parse(lastCall().init?.body as string)).toEqual({
      percentage_charge: 0,
      business_name: "Inn",
      settlement_bank: "040",
      account_number: "123",
    });

    await createSubaccount({
      business_name: "Inn",
      settlement_bank: "040",
      account_number: "123",
      percentage_charge: 2.5,
    });
    expect(JSON.parse(lastCall().init?.body as string).percentage_charge).toBe(2.5);
  });

  it("PUTs updates to the encoded subaccount code", async () => {
    fetchMock.mockResolvedValue(okResponse({ subaccount_code: "ACCT_1" }));
    await updateSubaccount("ACCT/1", { business_name: "New" });
    const { url, init } = lastCall();
    expect(url).toBe("https://api.paystack.co/subaccount/ACCT%2F1");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toEqual({ business_name: "New" });
  });

  it("uses Paystack's update-specific bank_code field", async () => {
    fetchMock.mockResolvedValue(okResponse({ subaccount_code: "ACCT_1" }));
    await updateSubaccount("ACCT_1", { bank_code: "040", account_number: "123456" });
    expect(JSON.parse(lastCall().init?.body as string)).toEqual({
      bank_code: "040",
      account_number: "123456",
    });
  });
});

describe("transactions", () => {
  it("initializes a transaction with the provided payload", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ authorization_url: "https://pay", access_code: "ac", reference: "ref1" })
    );

    const res = await initializeTransaction({
      email: "a@b.com",
      amount: 45000,
      reference: "ref1",
      callback_url: "https://cb",
      subaccount: "ACCT_1",
      metadata: { bookingId: "b1" },
    });

    expect(res.authorization_url).toBe("https://pay");
    const { url, init } = lastCall();
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toMatchObject({
      amount: 45000,
      metadata: { bookingId: "b1" },
    });
  });

  it("omits metadata when none is supplied", async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    await initializeTransaction({
      email: "a@b.com",
      amount: 100,
      reference: "ref2",
      callback_url: "https://cb",
      subaccount: "ACCT_1",
    });
    expect(JSON.parse(lastCall().init?.body as string)).not.toHaveProperty("metadata");
  });

  it("verifies a transaction by encoded reference", async () => {
    fetchMock.mockResolvedValue(okResponse({ status: "success", amount: 100, reference: "ref 3" }));
    const res = await verifyTransaction("ref 3");
    expect(res.status).toBe("success");
    expect(lastCall().url).toBe("https://api.paystack.co/transaction/verify/ref%203");
  });
});


describe("endpointLabel", () => {
  it("keeps literal segments that contain an underscore", () => {
    expect(endpointLabel("/transaction/charge_authorization")).toBe("/transaction/charge_authorization");
  });

  it("collapses reference segments so failures group per endpoint", () => {
    expect(endpointLabel("/transaction/verify/RL-8H2K91")).toBe("/transaction/verify/:id");
  });

  it("drops the query string, which can carry an account number", () => {
    expect(endpointLabel("/bank/resolve?account_number=0123456789&bank_code=058")).toBe("/bank/resolve");
  });
});

describe("split fee-bearer & mode isolation (BLK-02 / BLK-04)", () => {
  it("passes transaction_charge and bearer='account' when a platform fee is present", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ authorization_url: "https://pay", access_code: "ac", reference: "ref-split" })
    );

    await initializeTransaction({
      email: "guest@example.com",
      amount: 100_000,
      currency: "GHS",
      reference: "ref-split",
      callback_url: "https://cb",
      subaccount: "ACCT_hotel",
      transaction_charge: 4_000,
      bearer: "account",
    });

    const sent = JSON.parse(lastCall().init?.body as string);
    expect(sent).toMatchObject({
      amount: 100_000,
      subaccount: "ACCT_hotel",
      transaction_charge: 4_000,
      bearer: "account",
    });
  });

  it("omits both transaction_charge and bearer when platform fee is zero", async () => {
    fetchMock.mockResolvedValue(
      okResponse({ authorization_url: "https://pay", access_code: "ac", reference: "ref-zero" })
    );

    await initializeTransaction({
      email: "guest@example.com",
      amount: 100_000,
      currency: "GHS",
      reference: "ref-zero",
      callback_url: "https://cb",
      subaccount: "ACCT_hotel",
    });

    const sent = JSON.parse(lastCall().init?.body as string);
    expect(sent).not.toHaveProperty("transaction_charge");
    expect(sent).not.toHaveProperty("bearer");
  });

  it("isolates test vs live subaccounts according to PAYSTACK_SECRET_KEY", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_abc");
    expect(getPaystackMode()).toBe("test");
    expect(
      isUsableSubaccount({ paystack_subaccount_code: "ACCT_1", paystack_domain: "test" })
    ).toBe(true);
    expect(
      isUsableSubaccount({ paystack_subaccount_code: "ACCT_1", paystack_domain: "live" })
    ).toBe(false);

    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_xyz");
    expect(getPaystackMode()).toBe("live");
    expect(
      isUsableSubaccount({ paystack_subaccount_code: "ACCT_1", paystack_domain: "test" })
    ).toBe(false);
    expect(
      isUsableSubaccount({ paystack_subaccount_code: "ACCT_1", paystack_domain: "live" })
    ).toBe(true);
    expect(
      isUsableSubaccount({ paystack_subaccount_code: null, paystack_domain: "live" })
    ).toBe(false);
  });
});

describe("settlements pagination (BLK-06)", () => {
  it("returns [] on an empty first page without throwing", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([]));
    await expect(listSettlements({ subaccountId: 42 })).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns rows on a single short page", async () => {
    const sample = [{ id: 1, status: "success", total_amount: 96000, effective_amount: 96000 }];
    fetchMock.mockResolvedValueOnce(okResponse(sample));
    await expect(listSettlements({ subaccountId: 42, perPage: 50 })).resolves.toEqual(sample);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("paginates across perPage boundary and terminates on the short trailing page", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse([{ id: 1 }, { id: 2 }]))
      .mockResolvedValueOnce(okResponse([{ id: 3 }]));

    const result = await listSettlements({ subaccountId: 42, perPage: 2 });
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws safety limit error when MAX_PAGES is exceeded", async () => {
    fetchMock.mockResolvedValue(okResponse([{ id: 1 }]));
    await expect(listSettlements({ subaccountId: 42, perPage: 1 })).rejects.toThrow(
      "Paystack settlement pagination exceeded the safety limit"
    );
  });

  it("paginates listSettlementTransactions and stops cleanly on short page", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse([{ id: 101 }, { id: 102 }]))
      .mockResolvedValueOnce(okResponse([]));

    const txns = await listSettlementTransactions(99, { perPage: 2 });
    expect(txns.map((t) => t.id)).toEqual([101, 102]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
