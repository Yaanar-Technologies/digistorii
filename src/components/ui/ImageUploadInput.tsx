"use client";

import React, { useState, useRef } from "react";

export interface ImageUploadInputProps {
  label: string;
  value: string;
  onChange: (url: string, imageId?: number) => void;
  company: string;
  assetType?: string;
  categoryId?: number;
  materialId?: number;
  colorId?: number;
  source?: string;
  placeholder?: string;
  helpText?: string;
}

export const ImageUploadInput: React.FC<ImageUploadInputProps> = ({
  label,
  value,
  onChange,
  company,
  assetType = "ecom",
  categoryId,
  materialId,
  colorId,
  source,
  placeholder = "https://example.com/image.png",
  helpText,
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("asset_type", assetType);
      if (categoryId) formData.append("category_id", String(categoryId));
      if (materialId) formData.append("material_id", String(materialId));
      if (colorId) formData.append("color_id", String(colorId));
      if (source) formData.append("source", source);

      const targetCompany = company || "default";
      const res = await fetch(`/api/${targetCompany}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to upload image asset");
      }

      const data = await res.json();
      if (data.success && data.url) {
        onChange(data.url, data.id || data.imageId);
      } else {
        throw new Error(data.message || "Invalid upload response");
      }
    } catch (err: any) {
      console.error("Image upload error:", err);
      setError(err.message || "Upload failed. Check file type or connection.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-700">{label}</label>

      {/* Main Control Group: Text Input + Upload Button */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setError(null);
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none pr-8"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-1 text-xs"
              title="Clear image URL"
            >
              ✕
            </button>
          )}
        </div>

        {/* Hidden File Picker Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* File Trigger Button */}
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {uploading ? (
            <>
              <svg className="h-4 w-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>Uploading...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>{value ? "Change File" : "Upload File"}</span>
            </>
          )}
        </button>
      </div>

      {helpText && <p className="text-xs text-gray-500">{helpText}</p>}

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {/* Image Thumbnail Preview */}
      {value && (
        <div className="mt-2 relative group w-fit rounded-lg border border-gray-200 bg-gray-50 p-1.5 shadow-xs flex items-center gap-3">
          <img
            src={value}
            alt={`${label} Preview`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://via.placeholder.com/150?text=Invalid+Image+URL";
            }}
            className="h-14 w-auto max-w-[200px] rounded object-contain bg-white border border-gray-100"
          />
          <div className="text-xs text-gray-500 pr-2">
            <span className="font-semibold text-emerald-600 block">✓ Active Asset</span>
            <span className="truncate max-w-[150px] block text-[10px] text-gray-400">{value}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUploadInput;
