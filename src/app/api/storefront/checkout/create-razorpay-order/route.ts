import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const amountInINR = Number(body?.amount || 0);

    if (!amountInINR || amountInINR <= 0) {
      return NextResponse.json(
        { success: false, message: "Valid cart total amount is required" },
        { status: 400 }
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_mock_key_id";
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "rzp_test_mock_key_secret";

    let razorpayOrderId = `order_${Date.now()}`;
    let amountInPaise = Math.round(amountInINR * 100);

    try {
      if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        const instance = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

        const order = await instance.orders.create({
          amount: amountInPaise,
          currency: "INR",
          receipt: `rcpt_sf_${Date.now()}`,
        });

        razorpayOrderId = order.id;
      }
    } catch (razorpayErr) {
      console.warn("Razorpay API fallback to test mock order:", razorpayErr);
    }

    return NextResponse.json({
      success: true,
      key_id: keyId,
      order: {
        id: razorpayOrderId,
        amount: amountInPaise,
        currency: "INR",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Failed to initialize Razorpay checkout order" },
      { status: 500 }
    );
  }
}
