"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  CheckoutShell,
  StorefrontFooter,
  CustomerAuthModal,
  CartItemType,
  mockFooterSettings,
  useStorefrontTheme,
} from "@/components/storefront";
import type { CheckoutOrderDetails, CheckoutPaymentMethod } from "@/components/storefront/CheckoutShell";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { formatPrice } from "@/lib/currency";
import { apiFetch } from "@/lib/apiFetch";

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && (window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface PendingPrepaidOrder {
  orderId: number;
  orderNo: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: string;
  totalAmount: number;
  paymentMethod: CheckoutPaymentMethod;
  customerInfo?: {
    name?: string;
    email?: string;
    contact?: string;
  };
}

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  const theme = useStorefrontTheme();
  const [footerSettings] = useState(mockFooterSettings);

  const [customer, setCustomer] = useState<{
    id: number;
    name: string;
    email?: string;
    phone?: string;
    addresses?: any[];
  } | null>(null);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Polling state
  const [isPolling, setIsPolling] = useState(false);
  const [pollingMessage, setPollingMessage] = useState("");
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Completed order data
  const [orderConfirmedData, setOrderConfirmedData] = useState<{
    orderNo: string;
    totalAmount: number;
  } | null>(null);

  // Delayed confirmation notice (poll timed out)
  const [delayedConfirmationOrder, setDelayedConfirmationOrder] = useState<{
    orderNo: string;
    orderId: number;
  } | null>(null);

  // Pending prepaid order for retry
  const [pendingPrepaidOrder, setPendingPrepaidOrder] = useState<PendingPrepaidOrder | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cartItems = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    // Check customer session
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/storefront/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.customer) {
            setCustomer(data.customer);
          } else {
            setIsAuthOpen(true);
          }
        }
      } catch (err) {
        setIsAuthOpen(true);
      }
    };
    checkAuth();

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const convertedCartItems: CartItemType[] = cartItems.map((ci: CartItem) => ({
    variantId: Number(ci.id),
    productName: ci.name,
    image: ci.image,
    price: ci.price,
    quantity: ci.quantity,
    inStock: true,
  }));

  // Polling helper
  const pollOrderPayment = (
    orderId: number,
    orderNo: string,
    totalAmount: number
  ) => {
    setIsPolling(true);
    setPollingMessage("Payment received — confirming your order with the store...");
    setErrorMessage(null);

    let attempts = 0;
    const maxAttempts = 15;
    const intervalMs = 2000;

    const checkStatus = async (): Promise<boolean> => {
      try {
        const res = await apiFetch(`/api/${company}/ecom/orders/${orderId}`, company);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.order) {
            const status = data.order.payment_status;
            if (status === "paid") {
              setOrderConfirmedData({
                orderNo: data.order.order_no || orderNo,
                totalAmount: Number(data.order.total_amount || totalAmount),
              });
              clearCart();
              setIsPolling(false);
              setPendingPrepaidOrder(null);
              return true;
            } else if (status === "failed") {
              setErrorMessage(
                `Payment failed for order ${orderNo}. Please try again.`
              );
              setIsPolling(false);
              return true;
            }
          }
        }
      } catch (err) {
        console.error("Order polling error:", err);
      }
      return false;
    };

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      const done = await checkStatus();
      if (done) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      } else if (attempts >= maxAttempts) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setIsPolling(false);
        setDelayedConfirmationOrder({
          orderNo,
          orderId,
        });
      }
    }, intervalMs);
  };

  // Open Razorpay widget with existing order credentials
  const launchRazorpayModal = (orderInfo: PendingPrepaidOrder) => {
    const options = {
      key: orderInfo.razorpayKeyId,
      amount: orderInfo.amount,
      currency: orderInfo.currency || "INR",
      name: company,
      description: `Order #${orderInfo.orderNo}`,
      order_id: orderInfo.razorpayOrderId,
      handler: function (_response: any) {
        // Payment captured by client widget -> start server polling
        pollOrderPayment(
          orderInfo.orderId,
          orderInfo.orderNo,
          orderInfo.totalAmount
        );
      },
      prefill: orderInfo.customerInfo || {},
      notes: {
        order_id: String(orderInfo.orderId),
        order_no: orderInfo.orderNo,
        company,
      },
      theme: {
        color: theme.primaryColor || "#2563eb",
      },
      modal: {
        ondismiss: function () {
          setIsPlacingOrder(false);
          setPendingPrepaidOrder(orderInfo);
          setErrorMessage(
            `Checkout was cancelled. You can retry payment for Order #${orderInfo.orderNo} below.`
          );
        },
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.on("payment.failed", function (resp: any) {
      setIsPlacingOrder(false);
      setErrorMessage(
        resp.error?.description ||
          "Payment attempt failed. You can retry payment anytime."
      );
    });
    rzp.open();
  };

  // Main checkout submission handler
  const handlePlaceOrder = async (orderData: CheckoutOrderDetails) => {
    setIsPlacingOrder(true);
    setErrorMessage(null);
    setDelayedConfirmationOrder(null);

    try {
      let finalCustomerId = customer?.id || orderData.customerId;
      let finalAddressId = orderData.shippingAddressId;

      // 1. If addressId is missing or customerId is missing, ensure customer address is created
      if (!finalAddressId || !finalCustomerId) {
        const addrPayload = {
          company,
          customerId: finalCustomerId || 0,
          recipient_name: orderData.shippingAddress.fullName.trim(),
          recipient_phone: orderData.shippingAddress.phone.trim(),
          address_line1: orderData.shippingAddress.addressLine.trim(),
          address_line2: (orderData.shippingAddress.addressLine2 || "").trim(),
          city: orderData.shippingAddress.city.trim(),
          state: orderData.shippingAddress.state.trim(),
          pincode: orderData.shippingAddress.postalCode.trim(),
          country: orderData.shippingAddress.country || "India",
          is_default: orderData.shippingAddress.isDefault ?? true,
          email: orderData.shippingAddress.email?.trim() || customer?.email || "",
        };

        const saveRes = await fetch("/api/ecom/customer/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(addrPayload),
        });

        const saveJson = await saveRes.json();
        if (saveJson.success && saveJson.address) {
          finalAddressId = saveJson.address.id;
          finalCustomerId = finalCustomerId || saveJson.address.customer_id;
        } else {
          throw new Error(saveJson.message || "Failed to save delivery address.");
        }
      }

      if (!finalCustomerId) {
        throw new Error("Unable to identify customer for this order. Please sign in or re-enter details.");
      }

      // 2. Call POST /api/[company]/ecom/checkout
      const checkoutPayload = {
        customerId: finalCustomerId,
        shippingAddressId: finalAddressId,
        billingAddressId: finalAddressId,
        paymentMethod: orderData.paymentMethod,
        items: convertedCartItems.map((item) => ({
          variantId: item.variantId,
          qty: item.quantity,
        })),
      };

      const checkoutRes = await apiFetch(
        `/api/${company}/ecom/checkout`,
        company,
        {
          method: "POST",
          body: JSON.stringify(checkoutPayload),
        }
      );

      const checkoutData = await checkoutRes.json();

      if (!checkoutRes.ok || !checkoutData.success) {
        throw new Error(
          checkoutData.error || "Failed to process checkout. Please try again."
        );
      }

      // 3. Branch on paymentMethod
      if (orderData.paymentMethod === "cod") {
        // Order placed immediately on server
        setOrderConfirmedData({
          orderNo: checkoutData.order_no,
          totalAmount: Number(checkoutData.total_amount),
        });
        clearCart();
        setPendingPrepaidOrder(null);
      } else {
        // Prepaid flow via tenant's Razorpay gateway credentials
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) {
          throw new Error(
            "Failed to load payment gateway widget. Please check your internet connection."
          );
        }

        const pendingOrder: PendingPrepaidOrder = {
          orderId: checkoutData.order_id,
          orderNo: checkoutData.order_no,
          razorpayOrderId: checkoutData.razorpay_order_id,
          razorpayKeyId: checkoutData.razorpay_key_id,
          amount: checkoutData.amount,
          currency: checkoutData.currency || "INR",
          totalAmount: orderData.grandTotal,
          paymentMethod: orderData.paymentMethod,
          customerInfo: {
            name: orderData.shippingAddress.fullName || customer?.name,
            email: orderData.shippingAddress.email || customer?.email,
            contact: orderData.shippingAddress.phone || customer?.phone,
          },
        };

        setPendingPrepaidOrder(pendingOrder);
        launchRazorpayModal(pendingOrder);
      }
    } catch (err: any) {
      console.error("[Checkout error]:", err);
      setErrorMessage(err.message || "An unexpected error occurred during checkout.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!pendingPrepaidOrder) return;
    setIsPlacingOrder(true);
    setErrorMessage(null);

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setIsPlacingOrder(false);
      setErrorMessage("Failed to load payment gateway. Please check your connection.");
      return;
    }

    launchRazorpayModal(pendingPrepaidOrder);
  };

  return (
    <div
      className="min-h-screen bg-white flex flex-col justify-between"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div>
        <StorefrontHeader
          theme={theme}
          cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
          onOpenCart={() => router.push(`/${company}/store/cart`)}
          onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
          onOpenAuth={() => setIsAuthOpen(true)}
        />

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Interim Polling State */}
          {isPolling && (
            <div className="rounded-3xl border border-blue-200 bg-blue-50/50 p-8 text-center max-w-lg mx-auto my-12 space-y-4 shadow-lg">
              <div className="h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <h2 className="text-xl font-bold text-gray-900">Confirming Your Order</h2>
              <p className="text-sm text-gray-600">{pollingMessage}</p>
              <p className="text-xs text-gray-400">Please do not close or refresh this page...</p>
            </div>
          )}

          {/* Success Screen */}
          {!isPolling && orderConfirmedData && (
            <div className="rounded-3xl border border-green-200 bg-green-50/50 p-8 text-center max-w-lg mx-auto my-12 space-y-4 shadow-lg">
              <div className="h-16 w-16 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                ✓
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Order Placed Successfully!</h1>
              <p className="text-sm text-gray-600">
                Thank you for your purchase. Your order number is{" "}
                <span className="font-bold text-gray-900">{orderConfirmedData.orderNo}</span>.
              </p>
              <div className="text-lg font-bold text-gray-900 pt-2">
                Total Amount: {formatPrice(orderConfirmedData.totalAmount)}
              </div>
              <button
                onClick={() => router.push(`/${company}/store`)}
                className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 cursor-pointer"
                style={{ backgroundColor: theme.primaryColor }}
              >
                Back to Storefront
              </button>
            </div>
          )}

          {/* Delayed Confirmation State */}
          {!isPolling && !orderConfirmedData && delayedConfirmationOrder && (
            <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-8 text-center max-w-lg mx-auto my-12 space-y-4 shadow-lg">
              <div className="h-14 w-14 bg-amber-500 text-white rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                !
              </div>
              <h1 className="text-xl font-bold text-gray-900">Payment Confirmation Delayed</h1>
              <p className="text-sm text-gray-600">
                We received your payment, but confirmation from the payment gateway is taking longer than expected.
              </p>
              <div className="bg-white p-4 rounded-xl border border-amber-100 text-sm">
                <div className="font-semibold text-gray-800">
                  Order Number: <span className="text-blue-600">{delayedConfirmationOrder.orderNo}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  If your account was debited, your order will be confirmed shortly. Please save your order number and contact support if needed.
                </p>
              </div>
              <button
                onClick={() => router.push(`/${company}/store`)}
                className="mt-4 w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white shadow hover:bg-gray-800 cursor-pointer"
              >
                Return to Store
              </button>
            </div>
          )}

          {/* Standard Checkout Form */}
          {!isPolling && !orderConfirmedData && !delayedConfirmationOrder && (
            <>
              {/* Error and Retry Banner */}
              {errorMessage && (
                <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-amber-600 text-xl font-bold">⚠️</span>
                    <span className="text-xs sm:text-sm text-amber-800 font-medium">
                      {errorMessage}
                    </span>
                  </div>
                  {pendingPrepaidOrder && (
                    <button
                      onClick={handleRetryPayment}
                      disabled={isPlacingOrder}
                      className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer shrink-0"
                      style={{ backgroundColor: theme.primaryColor }}
                    >
                      {isPlacingOrder ? "Opening Gateway..." : `Retry Payment (${formatPrice(pendingPrepaidOrder.totalAmount)})`}
                    </button>
                  )}
                </div>
              )}

              <CheckoutShell
                theme={theme}
                company={company}
                items={convertedCartItems}
                onPlaceOrder={handlePlaceOrder}
                savedAddresses={customer?.addresses}
                isLoading={isPlacingOrder}
              />
            </>
          )}
        </main>
      </div>

      <StorefrontFooter theme={theme} settings={footerSettings} />

      <CustomerAuthModal
        theme={theme}
        company={company}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccessAuth={(ident, custData) => {
          if (custData) setCustomer(custData);
          else setCustomer({ id: 1, name: ident });
          setIsAuthOpen(false);
        }}
      />
    </div>
  );
}
