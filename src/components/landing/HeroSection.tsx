import Link from "next/link";
import { useState } from "react";

export default function HeroSection() {
  const [showDemoVideo, setShowDemoVideo] = useState(false);
  const scrollToPricing = (e: React.MouseEvent) => {
    e.preventDefault();
    const pricingSection = document.getElementById("pricing");
    if (pricingSection) {
      pricingSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  return (
    <section id="home" className="relative bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 text-white py-20 overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      {/* Background decoration */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-20 w-96 h-96 bg-pink-300 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="text-center">
          {/* Trust line */}
          <p className="text-blue-200 text-sm font-medium mb-4 uppercase tracking-wide">
            Perfect for shops, small businesses, service providers, and local brands
          </p>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
            Get Your Business Online in <span className="text-yellow-300">24 Hours</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-blue-100 mb-4 max-w-4xl mx-auto">
            With Your Own Store + Admin Dashboard
          </p>

          {/* Supporting line */}
          <p className="text-lg text-blue-200 mb-8 max-w-3xl mx-auto">
            We build a complete website for your business, including an online store, inventory management,
            invoices, and order tracking — all in one system.
          </p>

          <p className="text-base text-blue-100 mb-10">
            No coding. No complicated setup. Just upload products and start selling.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">

            <button
              onClick={scrollToPricing}
              className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            >
              View Pricing →
            </button>
            <button className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-600 transition-all">
              Request for Demo
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}