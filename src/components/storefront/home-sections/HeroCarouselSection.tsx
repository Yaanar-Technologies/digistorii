"use client";

import React, { useState, useEffect, useCallback } from "react";
import { HeroCarouselSection as HeroCarouselSectionType, StorefrontTheme } from "../types";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

interface HeroCarouselSectionProps {
  section: HeroCarouselSectionType;
  theme: StorefrontTheme;
  imagesById?: Record<number, string>;
  onCtaClick?: (link?: string) => void;
  isPreview?: boolean;
}

export const HeroCarouselHomeSection: React.FC<HeroCarouselSectionProps> = ({
  section,
  theme,
  imagesById = {},
  onCtaClick,
  isPreview = false,
}) => {
  const slides = section.slides || [];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // If no slides configured
  if (slides.length === 0) {
    if (isPreview) {
      return (
        <section className="relative overflow-hidden bg-gray-50 py-16 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl m-4">
          <p className="text-sm font-medium text-gray-400">Hero Carousel: No slides configured</p>
        </section>
      );
    }
    return null;
  }

  const nextSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  // Auto-play interval
  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      nextSlide();
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length, isPaused, nextSlide]);

  const currentSlide = slides[currentIdx] || slides[0];
  const slideImageUrl = (currentSlide.imageId && imagesById[currentSlide.imageId]) || currentSlide.imageUrl || "";

  return (
    <section
      className="relative overflow-hidden bg-gray-900 text-white transition-all min-h-[380px] sm:min-h-[460px] md:min-h-[520px] flex items-center"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{ fontFamily: theme.fontFamily }}
    >
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        {slideImageUrl ? (
          <img
            key={slideImageUrl}
            src={slideImageUrl}
            alt={currentSlide.title || "Hero Banner"}
            className="h-full w-full object-cover object-center transition-opacity duration-700 opacity-80"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(135deg, ${theme.primaryColor || "#1e293b"} 0%, ${theme.secondaryColor || "#0f172a"} 100%)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-12 sm:px-8 lg:px-12 w-full">
        <div className="max-w-2xl space-y-4">
          {currentSlide.title && (
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-white drop-shadow-md leading-tight">
              {currentSlide.title}
            </h1>
          )}
          {currentSlide.subtitle && (
            <p className="text-base sm:text-lg lg:text-xl text-gray-200 drop-shadow max-w-xl font-normal">
              {currentSlide.subtitle}
            </p>
          )}

          {currentSlide.buttonText && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onCtaClick && onCtaClick(currentSlide.buttonLink)}
                className="inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                style={{ backgroundColor: theme.primaryColor || "#2563eb" }}
              >
                {currentSlide.buttonText}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Carousel Navigation Arrows (only if multi-slide) */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={prevSlide}
            aria-label="Previous slide"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/40 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-110 cursor-pointer"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={nextSlide}
            aria-label="Next slide"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/40 p-2.5 text-white backdrop-blur-sm transition-all hover:bg-black/70 hover:scale-110 cursor-pointer"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>

          {/* Dots Indicator */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIdx(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                  currentIdx === idx ? "w-8 bg-white" : "w-2.5 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default HeroCarouselHomeSection;
