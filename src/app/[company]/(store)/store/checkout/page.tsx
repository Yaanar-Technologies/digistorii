"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  StorefrontHeader,
  CheckoutShell,
  StorefrontFooter,
  CustomerAuthModal,
  StorefrontTheme,
  CartItemType,
  mockTheme,
  mockFooterSettings,
} from "@/components/storefront";
import { useCartStore, type CartItem } from "@/store/cartStore";

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const company = (params.company as string) || "";

  const [theme] = useState<StorefrontTheme>(mockTheme);
  const [footerSettings] = useState(mockFooterSettings);

  const [customer, setCustomer] = useState<{ id: number; name: string; email?: string; phone?: string; addresses?: any[] } | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderConfirmedData, setOrderConfirmedData] = useState<{ orderNo: string; totalAmount: number } | null>(null);

  const cartItems = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);

  useEffect(() => {
    // Check if customer is authenticated
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
  }, []);

  const convertedCartItems: CartItemType[] = cartItems.map((ci: CartItem) => ({
    variantId: Number(ci.id),
    productName: ci.name,
    image: ci.image,
    price: ci.price,
    quantity: ci.quantity,
    inStock: true,
  }));

  const handlePlaceOrder = async (orderData: { address: any; paymentMethod: string }) => {
    setIsPlacingOrder(true);
    try {
      let razorpayPaymentId = null;

      // Handle Razorpay Test Mode checkout
      if (orderData.paymentMethod === "RAZORPAY") {
        const totalAmt = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const orderRes = await fetch("/api/storefront/checkout/create-razorpay-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: totalAmt }),
        });

        if (orderRes.ok) {
          const orderJson = await orderRes.json();
          razorpayPaymentId = orderJson.order?.id || `pay_mock_${Date.now()}`;
        }
      }

      // Submit place-order request
      const placeRes = await fetch("/api/storefront/checkout/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          customerId: customer?.id || 0,
          address: orderData.address,
          paymentMethod: orderData.paymentMethod,
          razorpayPaymentId,
          items: convertedCartItems,
        }),
      });

      if (placeRes.ok) {
        const data = await placeRes.json();
        if (data.success) {
          setOrderConfirmedData({
            orderNo: data.orderNo,
            totalAmount: data.totalAmount,
          });
          clearCart();
        } else {
          alert(data.message || "Failed to place order. Please try again.");
        }
      } else {
        alert("Server error processing your order.");
      }
    } catch (err: any) {
      alert(err.message || "An unexpected error occurred during checkout.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col justify-between" style={{ fontFamily: theme.fontFamily }}>
      <div>
        <StorefrontHeader
          theme={theme}
          cartCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
          onOpenCart={() => router.push(`/${company}/store/cart`)}
          onOpenWishlist={() => router.push(`/${company}/store/wishlist`)}
          onOpenAuth={() => setIsAuthOpen(true)}
        />

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {orderConfirmedData ? (
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
                Total Paid: ${orderConfirmedData.totalAmount.toFixed(2)}
              </div>
              <button
                onClick={() => router.push(`/${company}/store`)}
                className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700"
              >
                Back to Storefront
              </button>
            </div>
          ) : (
            <CheckoutShell
              theme={theme}
              items={convertedCartItems}
              onPlaceOrder={handlePlaceOrder}
              savedAddresses={customer?.addresses}
              isLoading={isPlacingOrder}
            />
          )}
        </main>
      </div>

      <StorefrontFooter theme={theme} settings={footerSettings} />

      <CustomerAuthModal
        theme={theme}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccessAuth={(ident) => {
          setCustomer({ id: 1, name: ident });
          setIsAuthOpen(false);
        }}
      />
    </div>
  );
}
