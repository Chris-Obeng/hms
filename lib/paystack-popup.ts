/**
 * Browser-side Paystack checkout (Popup V2, @paystack/inline-js).
 *
 * The server initializes the transaction (POST /transaction/initialize) and
 * returns its `access_code`; the guest completes it in Paystack's checkout
 * form on top of the booking page with `resumeTransaction(accessCode)`, as
 * Paystack documents for "initiate from the API, complete with Popup". The
 * hosted `authorization_url` stays the fallback whenever the popup cannot be
 * used.
 *
 * Nothing here confirms a payment. `onSuccess` only means the form reported
 * success; the confirmation page verifies the reference on the server
 * (GET /transaction/verify) and the webhook remains the primary path.
 *
 * Never import this from server code: the library touches `document`.
 */
import type PaystackPop from "@paystack/inline-js";
import type { PopupTransaction } from "@paystack/inline-js";

/** Paystack's own example falls back to the redirect after 10 seconds. */
const LOAD_TIMEOUT_MS = 10_000;

let popupPromise: Promise<PaystackPop> | null = null;

/**
 * Loads the library and creates the popup instance once per page. Creating it
 * early is what makes the popup fast: the constructor mounts Paystack's
 * checkout iframe hidden, so the form is already loaded when the guest pays.
 */
export function preloadPaystackPopup(): Promise<PaystackPop> {
  if (!popupPromise) {
    popupPromise = import("@paystack/inline-js")
      .then(({ default: Popup }) => new Popup())
      .catch((error: unknown) => {
        // Let a later call try again (flaky network, blocked script).
        popupPromise = null;
        throw error;
      });
  }
  return popupPromise;
}

export interface PaystackCheckoutOptions {
  /** `access_code` from transaction/initialize. Without it, the redirect is used. */
  accessCode: string | null | undefined;
  /** `authorization_url` from the same call: the hosted-checkout fallback. */
  authorizationUrl: string;
  /** The transaction reference we initialized, used if the form omits it. */
  reference: string;
  /** The form reported a completed payment. Verify it on the server next. */
  onSuccess: (reference: string) => void;
  /**
   * The form closed without reporting success: the guest cancelled, or a
   * transfer is still pending confirmation. The payment may still settle, so
   * check its status rather than assuming it failed.
   */
  onClose: (reference: string) => void;
}

/**
 * Opens Paystack's checkout over the page. Falls back to the hosted checkout
 * page when the library cannot load, the transaction reports a setup error,
 * or the form has not appeared within 10 seconds.
 */
export async function openPaystackCheckout({
  accessCode,
  authorizationUrl,
  reference,
  onSuccess,
  onClose,
}: PaystackCheckoutOptions): Promise<void> {
  if (!accessCode) {
    window.location.assign(authorizationUrl);
    return;
  }

  let popup: PaystackPop;
  try {
    popup = await preloadPaystackPopup();
  } catch {
    window.location.assign(authorizationUrl);
    return;
  }

  // Exactly one outcome per checkout, whichever arrives first.
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let transaction: PopupTransaction | undefined;
  const settle = () => {
    if (settled) return false;
    settled = true;
    clearTimeout(timer);
    return true;
  };

  const fallBackToRedirect = () => {
    if (!settle()) return;
    if (transaction) {
      try {
        // Closing it fires onCancel, which `settled` now ignores.
        popup.cancelTransaction(transaction);
      } catch {
        // The form may never have opened; nothing to close.
      }
    }
    window.location.assign(authorizationUrl);
  };

  try {
    transaction = popup.resumeTransaction(accessCode, {
      onLoad: () => clearTimeout(timer),
      onSuccess: (result) => {
        if (settle()) onSuccess(result?.reference || reference);
      },
      onCancel: () => {
        if (settle()) onClose(reference);
      },
      onError: () => fallBackToRedirect(),
    });
  } catch {
    // Never leave the guest without a way to pay: the booking already exists.
    fallBackToRedirect();
    return;
  }

  if (!settled) timer = setTimeout(fallBackToRedirect, LOAD_TIMEOUT_MS);
}
