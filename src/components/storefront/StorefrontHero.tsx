"use client";

import React, { useState, useEffect } from "react";
import { StorefrontTheme } from "./types";

export interface StorefrontHeroProps {
  theme: StorefrontTheme;
  ctaText?: string;
  onCtaClick?: () => void;
}

export const StorefrontHero: React.FC<StorefrontHeroProps> = ({
  theme,
  ctaText = "Shop Now",
  onCtaClick,
}) => {
  const images = theme.bannerImages.length > 0
    ? theme.bannerImages
    : ["https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80"];

  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <section
      className="relative overflow-hidden bg-gray-900 text-white min-h-[380px] sm:min-h-[460px] flex items-center"
      style={{ fontFamily: theme.fontFamily }}
    >
      {/* Background Images / Carousel Slider */}
      {images.map((imgUrl, index) => (
        <div
          key={imgUrl + index}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === currentSlide ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <img
            src={imgUrl}
            alt={`Banner slide ${index + 1}`}
            className="h-full w-full object-cover object-center"
          />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
        </div>
      ))}

      {/* Hero Text & CTA Content */}
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 w-full z-10">
        <div className="max-w-xl space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl drop-shadow-md">
            {theme.heroTitle || "Exclusive Collection"}
          </h1>
          <p className="text-base text-gray-200 sm:text-lg drop-shadow">
            {theme.heroDescription || "Discover our latest arrivals tailored to elevate your lifestyle."}
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={onCtaClick}
              className="inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {ctaText}
              <svg className="ml-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Carousel Dots */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {images.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentSlide(idx)}
              className={`h-2.5 rounded-full transition-all ${
                idx === currentSlide ? "w-8 bg-white" : "w-2.5 bg-white/50"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default StorefrontHero;
