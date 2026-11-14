/**
 * Types for the parts of @paystack/inline-js (Popup V2) that RoomLine uses.
 * The package ships no declarations; these follow its README
 * ("PaystackPop.resumeTransaction(accessCode, callbacks)").
 */
declare module "@paystack/inline-js" {
  export interface PopupTransaction {
    id: string | null;
    getStatus(): {
      status: string | null;
      id?: string;
      checkoutUrl?: string;
    };
  }

  export interface ResumeTransactionCallbacks {
    /** The checkout form loaded and the customer can see it. */
    onLoad?: (response: { id: number; customer: unknown; accessCode: string }) => void;
    /** The customer completed the payment. */
    onSuccess?: (transaction: { id: number; reference: string; message: string }) => void;
    /** The customer closed the form. */
    onCancel?: () => void;
    /** The transaction could not be loaded. */
    onError?: (error: { message: string }) => void;
  }

  export default class PaystackPop {
    constructor();
    resumeTransaction(accessCode: string, callbacks?: ResumeTransactionCallbacks): PopupTransaction;
    cancelTransaction(idOrTransaction?: string | PopupTransaction): void;
  }
}
