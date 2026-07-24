import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSubaccount,
  getPaystackBanks,
  initializeTransaction,
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

  it("throws with the response body on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "invalid key",
    });
    await expect(paystackFetch("/ping")).rejects.toThrow("Paystack 401: invalid key");
  });

  it("falls back to statusText when the error body cannot be read", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => {
        throw new Error("stream closed");
      },
    });
    await expect(paystackFetch("/ping")).rejects.toThrow("Paystack 500: Server Error");
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
