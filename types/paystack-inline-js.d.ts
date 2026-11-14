/**
 * Types for the parts of @paystack/inline-js (Popup V2) that RoomLine uses.
 * The package ships no declarations. These follow its README
 * ("PaystackPop.resumeTransaction(accessCode, callbacks)") and were checked
 * against the 2.28.0 bundle: the README's `PopupTransaction.getStatus()` is
 * not in it, so it is not declared here.
 */
declare module "@paystack/inline-js" {
  export interface PopupTransaction {
    /** Paystack's transaction id, set when the form loads (`onLoad`). */
    id: number | null;
  }

  export interface ResumeTransactionCallbacks {
    /** The checkout form loaded and the customer can see it. */
    onLoad?: (response: { id: number; customer: unknown; accessCode: string }) => void;
    /** The customer completed the payment. */
    onSuccess?: (transaction: { id: number; reference: string; message: string }) => void;
    /** The customer closed the form, or a transfer is pending confirmation. */
    onCancel?: () => void;
    /** The transaction could not be loaded. */
    onError?: (error: { message: string }) => void;
  }

  export default class PaystackPop {
    constructor();
    resumeTransaction(accessCode: string, callbacks?: ResumeTransactionCallbacks): PopupTransaction;
    /**
     * Matches `id` against each transaction's id; with no match it cancels the
     * active transaction. Cancelling fires that transaction's `onCancel`.
     */
    cancelTransaction(id?: number | string): void;
  }
}
