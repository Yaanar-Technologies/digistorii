import { NextRequest, NextResponse } from "next/server";
import { GET as getGatewaySettings, POST as postGatewaySettings } from "../../../admin/settings/payment-gateways/route";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ company: string }> }
) {
  return getGatewaySettings(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ company: string }> }
) {
  return postGatewaySettings(req, context);
}

