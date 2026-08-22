
import type { Metadata } from "next";
import { EcommerceMetrics } from "@/components/ecommerce/EcommerceMetrics";
import React from "react";
import PaymentModeBreakdown from "@/components/ecommerce/PaymentModeBreakdown";
import MonthlySalesChart from "@/components/ecommerce/MonthlySalesChart";
import StatisticsChart from "@/components/ecommerce/StatisticsChart";
import RecentOrders from "@/components/ecommerce/RecentOrders";
import PoGrnPendingTable from "@/components/dashboard/PoGrnPendingTable";
import PoStatusWise from "@/components/dashboard/PoStatusWise";
import TopSellingProducts from "@/components/dashboard/TopSellingProducts";
import TopSuppliers from "@/components/dashboard/TopSuppliers";
import TopCustomers from "@/components/dashboard/TopCustomers";
import SalesVsPurchaseChart from "@/components/dashboard/SalesVsPurchaseChart";
import GrnStatusWise from "@/components/dashboard/GrnStatusWise";


export const metadata: Metadata = {
  title:
    "DigiStorii - User Panel",
  description: "This is Home for  Dashboard Template",
};

export default function Ecommerce() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 space-y-6 xl:col-span-6">
        {/* Total Sales, Revenue, Orders, Customers */}
        <EcommerceMetrics />
        {/* LEFT - Monthly Sales Chart */}
        <MonthlySalesChart />





      </div>

      <div className="col-span-12 space-y-6 xl:col-span-6">
        {/* Payment Mode Breakdown */}
        <PaymentModeBreakdown />
      </div>

      <div className="col-span-12">
        <div className="grid grid-cols-12 gap-4">

          {/* LEFT - Top Supplier*/}
          <div className="col-span-12 xl:col-span-6">
            <TopSuppliers />
          </div>

          {/* RIGHT - Top Customer */}
          <div className="col-span-12 xl:col-span-6">
            <TopCustomers />
          </div>

        </div>
      </div>

      <div className="col-span-12">
        <div className="grid grid-cols-12 gap-4">

          {/* LEFT - Pending Purchase Orders for GRN Creation */}
          <div className="col-span-12 xl:col-span-6">

            <PoGrnPendingTable />
          </div>

          {/* RIGHT - Purchase Order Status Wise */}
          <div className="col-span-12 xl:col-span-6">

            <PoStatusWise />
            <br></br>
            {/* <SalesVsPurchaseChart /> */}
            <GrnStatusWise />
          </div>

        </div>
      </div>

      <div className="col-span-12">
        {/* Sales Yearly / Monthly Comparison */}
        <StatisticsChart />
      </div>

      <div className="col-span-12">
        <div className="grid grid-cols-12 gap-4">

          {/* LEFT - Recent Orders */}
          <div className="col-span-12 xl:col-span-6">
            <RecentOrders />
          </div>

          {/* RIGHT - Top Selling */}
          <div className="col-span-12 xl:col-span-6">
            <TopSellingProducts />
          </div>

        </div>
      </div>
    </div>
  );
}

