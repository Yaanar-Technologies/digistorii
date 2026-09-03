"use client";

import React from "react";
import { AboutSection as AboutSectionType, StorefrontTheme } from "../types";

interface AboutSectionProps {
  section: AboutSectionType;
  theme: StorefrontTheme;
  imagesById?: Record<number, string>;
  isPreview?: boolean;
}

export const AboutHomeSection: React.FC<AboutSectionProps> = ({
  section,
  theme,
  imagesById = {},
  isPreview = false,
}) => {
  const blocks = section.blocks || [];

  if (blocks.length === 0) {
    if (isPreview) {
      return (
        <section className="py-8 px-4 text-center border-2 border-dashed border-gray-200 rounded-xl m-4 bg-gray-50">
          <p className="text-sm font-medium text-gray-400">About Us: No story blocks configured</p>
        </section>
      );
    }
    return null;
  }

  const sectionTitle = section.title || "Our Story & Values";
  const sectionSubtitle =
    section.subtitle || "Learn more about our craftsmanship, mission, and dedication to excellence";

  return (
    <section className="py-14 sm:py-20 bg-gray-50/40" style={{ fontFamily: theme.fontFamily }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            {sectionTitle}
          </h2>
          {sectionSubtitle && (
            <p className="mt-2 text-sm sm:text-base text-gray-500">{sectionSubtitle}</p>
          )}
        </div>

        <div className="space-y-12 sm:space-y-16">
          {blocks.map((block, idx) => {
            const isImageRight = block.imagePosition === "right";
            const imageUrl =
              (block.imageId && imagesById[block.imageId]) ||
              block.imageUrl ||
              "https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=800&auto=format&fit=crop&q=80";

            return (
              <div
                key={block.id || idx}
                className={`flex flex-col gap-8 lg:items-center ${
                  isImageRight ? "lg:flex-row-reverse" : "lg:flex-row"
                }`}
              >
                {/* Image Illustration */}
                <div className="w-full lg:w-1/2">
                  <div className="overflow-hidden rounded-3xl shadow-md border border-gray-100 aspect-16/10 bg-gray-100">
                    <img
                      src={imageUrl}
                      alt={block.heading || "About block illustration"}
                      className="h-full w-full object-cover object-center transition-transform duration-500 hover:scale-105"
                    />
                  </div>
                </div>

                {/* Text Content */}
                <div className="w-full lg:w-1/2 space-y-4 px-2 sm:px-6">
                  {block.heading && (
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                      {block.heading}
                    </h3>
                  )}
                  {block.body && (
                    <p className="text-base text-gray-600 leading-relaxed whitespace-pre-line font-normal">
                      {block.body}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AboutHomeSection;
