import {
  ErrorCode,
  currentEntitlementIOS,
  endConnection,
  fetchProducts,
  finishTransaction,
  initConnection,
  isTransactionVerifiedIOS,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
} from "expo-iap";
import type {
  ExpoPurchaseError,
  Purchase,
  PurchaseIOS,
} from "expo-iap";

export const REMOVE_ADS_PRODUCT_ID = "remove_ads_lifetime";

export type RemoveAdsProduct = {
  displayName: string;
  displayPrice: string;
  description: string;
};

export type RemoveAdsStoreListeners = {
  onPurchaseUpdated: (purchase: Purchase) => void;
  onPurchaseError: (error: ExpoPurchaseError) => void;
};

export type RemoveAdsStoreConnection = {
  close: () => void;
};

export type VerifiedRemoveAdsEntitlement = {
  entitled: boolean;
  purchase: PurchaseIOS | null;
};

function isUsableEntitlement(
  purchase: PurchaseIOS | null,
  verified: boolean,
): purchase is PurchaseIOS {
  return Boolean(
    verified &&
      purchase &&
      purchase.store === "apple" &&
      purchase.productId === REMOVE_ADS_PRODUCT_ID &&
      purchase.purchaseState === "purchased" &&
      !purchase.revocationDateIOS,
  );
}

export async function connectRemoveAdsStore(
  listeners: RemoveAdsStoreListeners,
): Promise<RemoveAdsStoreConnection> {
  const updateSubscription = purchaseUpdatedListener(
    listeners.onPurchaseUpdated,
  );
  const errorSubscription = purchaseErrorListener(listeners.onPurchaseError);
  try {
    const connected = await initConnection();
    if (!connected) throw new Error("StoreKit connection was not established");
  } catch (error) {
    updateSubscription.remove();
    errorSubscription.remove();
    throw error;
  }
  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      updateSubscription.remove();
      errorSubscription.remove();
      void endConnection().catch(() => {});
    },
  };
}

export async function fetchRemoveAdsProduct(): Promise<RemoveAdsProduct | null> {
  const products = await fetchProducts({
    skus: [REMOVE_ADS_PRODUCT_ID],
    type: "in-app",
  });
  const product = (products || []).find(
    (candidate) =>
      candidate.id === REMOVE_ADS_PRODUCT_ID &&
      candidate.platform === "ios" &&
      candidate.type === "in-app" &&
      candidate.typeIOS === "non-consumable",
  );
  if (!product?.displayPrice) return null;
  return {
    displayName:
      product.displayName?.trim() || product.title?.trim() || "Remove Ads Forever",
    displayPrice: product.displayPrice,
    description: product.description?.trim() || "",
  };
}

export async function readVerifiedRemoveAdsEntitlement(): Promise<VerifiedRemoveAdsEntitlement> {
  const purchase = await currentEntitlementIOS(REMOVE_ADS_PRODUCT_ID);
  if (!purchase) return { entitled: false, purchase: null };
  const verified = await isTransactionVerifiedIOS(REMOVE_ADS_PRODUCT_ID);
  return isUsableEntitlement(purchase, verified)
    ? { entitled: true, purchase }
    : { entitled: false, purchase: null };
}

export async function requestRemoveAdsPurchase(): Promise<void> {
  await requestPurchase({
    request: {
      apple: {
        sku: REMOVE_ADS_PRODUCT_ID,
        andDangerouslyFinishTransactionAutomatically: false,
      },
    },
    type: "in-app",
  });
}

export async function restoreRemoveAdsPurchase(): Promise<void> {
  await restorePurchases();
}

export async function finishVerifiedRemoveAdsPurchase(
  purchase: Purchase,
): Promise<void> {
  await finishTransaction({ purchase, isConsumable: false });
}

export function removeAdsPurchaseErrorCode(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  return code;
}

export function isRemoveAdsPurchaseCancelled(error: unknown): boolean {
  return removeAdsPurchaseErrorCode(error) === ErrorCode.UserCancelled;
}

export function isRemoveAdsAlreadyOwned(error: unknown): boolean {
  return removeAdsPurchaseErrorCode(error) === ErrorCode.AlreadyOwned;
}

export function isRemoveAdsPurchasePending(error: unknown): boolean {
  const code = removeAdsPurchaseErrorCode(error);
  return code === ErrorCode.Pending || code === ErrorCode.DeferredPayment;
}

export function isRemoveAdsPurchaseEvent(purchase: Purchase): boolean {
  return (
    purchase.store === "apple" &&
    purchase.productId === REMOVE_ADS_PRODUCT_ID
  );
}
