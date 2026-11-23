"use client";

import React, { useState, useRef } from "react";

export interface ImageUploadInputProps {
  label: string;
  value: string;
  onChange: (url: string, imageId?: number, pendingFile?: File) => void;
  company: string;
  assetType?: string;
  categoryId?: number;
  materialId?: number;
  colorId?: number;
  source?: string;
  placeholder?: string;
  helpText?: string;
  deferUpload?: boolean;
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
  deferUpload = true,
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // If deferred upload is enabled (e.g. in theme editor), keep preview in local component state
    // and pass pendingFile to parent component so it can be committed atomically on "Save Draft".
    if (deferUpload) {
      try {
        const previewUrl = URL.createObjectURL(file);
        setIsPending(true);
        onChange(previewUrl, undefined, file);
      } catch (err: any) {
        setError(err.message || "Failed to create local image preview");
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
      return;
    }

    setUploading(true);

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
        setIsPending(false);
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
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-gray-700">{label}</label>
        {isPending && (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
            Unsaved Preview
          </span>
        )}
      </div>

      {/* Main Control Group: Text Input + Upload Button */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setError(null);
              setIsPending(false);
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:border-brand-500 focus:outline-none pr-8"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setIsPending(false);
                onChange("");
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm font-bold"
              title="Clear Image"
            >
              ✕
            </button>
          )}
        </div>

        {/* Hidden native file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png, image/jpeg, image/webp, image/gif, image/svg+xml"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Styled Trigger Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md shadow-xs transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
        >
          {uploading ? "Uploading..." : "Upload File"}
        </button>
      </div>

      {/* Help text & validation errors */}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      {helpText && !error && <p className="text-xs text-gray-500">{helpText}</p>}

      {/* Live Thumbnail Preview */}
      {value && !error && (
        <div className="mt-2 relative w-24 h-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 shadow-2xs group">
          <img
            src={value}
            alt="Uploaded Preview"
            className="w-full h-full object-cover"
            onError={() => {
              setError("Preview failed to render image from this URL.");
            }}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                setIsPending(false);
                onChange("");
              }}
              className="text-white bg-red-600/80 hover:bg-red-600 rounded-full p-1"
              title="Remove"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUploadInput;
