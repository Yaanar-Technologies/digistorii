"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import Badge from "@/components/ui/badge/Badge";
import { useUser } from "@/context/CurrentUserContext";

type ThemeConfig = {
  logo_url?: string;
  header_title?: string;
  hero_title?: string;
  hero_subtitle?: string;
  hero_banner_url?: string;
  primary_color?: string;
  secondary_color?: string;
  social_facebook?: string;
  social_instagram?: string;
  social_whatsapp?: string;
  font_family?: string;
};

export default function ThemeCustomizationPage() {
  const params = useParams();
  const company = params.company as string || "";
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Theme states
  const [logoUrl, setLogoUrl] = useState("");
  const [headerTitle, setHeaderTitle] = useState("");
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [heroBannerUrl, setHeroBannerUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [secondaryColor, setSecondaryColor] = useState("#1e40af");
  const [socialFacebook, setSocialFacebook] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialWhatsapp, setSocialWhatsapp] = useState("");
  const [fontFamily, setFontFamily] = useState("Inter");

  // Status info
  const [publishedTheme, setPublishedTheme] = useState<ThemeConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishedBy, setPublishedBy] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;

    const fetchTheme = async () => {
      try {
        const res = await apiFetch("/api/company/ecom-theme", company);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.theme) {
            const config: ThemeConfig = data.theme.draft_theme || {};
            setLogoUrl(config.logo_url || "");
            setHeaderTitle(config.header_title || "");
            setHeroTitle(config.hero_title || "");
            setHeroSubtitle(config.hero_subtitle || "");
            setHeroBannerUrl(config.hero_banner_url || "");
            setPrimaryColor(config.primary_color || "#2563eb");
            setSecondaryColor(config.secondary_color || "#1e40af");
            setSocialFacebook(config.social_facebook || "");
            setSocialInstagram(config.social_instagram || "");
            setSocialWhatsapp(config.social_whatsapp || "");
            setFontFamily(config.font_family || "Inter");

            setVersion(data.theme.version || 0);
            setPublishedTheme(data.theme.published_theme || null);
            setPublishedAt(data.theme.published_at || null);
            setPublishedBy(data.theme.published_by || null);
            setIsSetupComplete(data.is_setup_complete === true);
          }
        }
      } catch (err) {
        console.error("Failed to load storefront theme details", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTheme();
  }, [company]);

  const getThemePayload = (): ThemeConfig => {
    return {
      logo_url: logoUrl,
      header_title: headerTitle,
      hero_title: heroTitle,
      hero_subtitle: heroSubtitle,
      hero_banner_url: heroBannerUrl,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      social_facebook: socialFacebook,
      social_instagram: socialInstagram,
      social_whatsapp: socialWhatsapp,
      font_family: fontFamily,
    };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/company/ecom-theme", company, {
        method: "POST",
        body: JSON.stringify({
          draft_theme: getThemePayload()
        })
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Draft storefront appearance saved successfully!" });
      } else {
        const errorData = await res.json();
        setMessage({ type: "error", text: errorData.message || "Failed to save draft theme config." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!isSetupComplete) {
      setMessage({ type: "error", text: "Please complete payment and shipping settings in Store Settings first before publishing." });
      return;
    }

    setPublishing(true);
    setMessage(null);
    try {
      // First save draft
      await apiFetch("/api/company/ecom-theme", company, {
        method: "POST",
        body: JSON.stringify({
          draft_theme: getThemePayload()
        })
      });

      // Trigger publish action
      const res = await apiFetch("/api/company/ecom-theme?action=publish", company, {
        method: "POST",
        body: JSON.stringify({
          publisher: user?.email || user?.name || "Workspace User"
        })
      });

      if (res.ok) {
        const data = await res.json();
        setVersion(data.version);
        setPublishedTheme(getThemePayload());
        setPublishedAt(new Date().toISOString());
        setPublishedBy(user?.email || user?.name || "Workspace User");
        setMessage({ type: "success", text: "Congratulations! Storefront appearance and staged products have been published live!" });
      } else {
        const errorData = await res.json();
        setMessage({ type: "error", text: errorData.message || "Publish action failed." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Loading storefront theme details...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="space-y-1">
          <Badge variant="light" color={version > 0 ? "success" : "warning"}>
            {version > 0 ? `Live: Version ${version}` : "Draft: Not Published"}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Customize Theme & Publish</h1>
          <p className="text-sm text-gray-600">Customize storefront styling, layout, banner messaging, and publish changes to customers.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none"
          >
            {saving ? "Saving Draft..." : "Save Draft"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || saving}
            className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-600 focus:outline-none disabled:opacity-50"
          >
            {publishing ? "Publishing Storefront..." : "Publish Live Storefront"}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm ${message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          {message.text}
        </div>
      )}

      {/* Publication History card */}
      {version > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/20 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-blue-900">Current Live Storefront Snapshot</h3>
            <p className="text-xs text-blue-700">
              Published at: {publishedAt ? new Date(publishedAt).toLocaleString() : "N/A"} by {publishedBy || "System"}
            </p>
          </div>
          <div>
            <a
              href={`/${company}/store`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Open Live Storefront
            </a>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Customize options */}
        <div className="md:col-span-2 space-y-6">
          {/* Logo & Header */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Logo & Header Branding</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Logo Image URL</label>
              <input
                type="text"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Header Title text</label>
              <input
                type="text"
                value={headerTitle}
                onChange={e => setHeaderTitle(e.target.value)}
                placeholder="e.g. DK Designs Official Store"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Hero Banner Section */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Hero Welcome Banner</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Hero Main Title</label>
              <input
                type="text"
                value={heroTitle}
                onChange={e => setHeroTitle(e.target.value)}
                placeholder="e.g. Summer Fashion Sale"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Hero Subtitle message</label>
              <input
                type="text"
                value={heroSubtitle}
                onChange={e => setHeroSubtitle(e.target.value)}
                placeholder="e.g. Get up to 50% discount on all premium products online"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">Hero Banner Background Image URL</label>
              <input
                type="text"
                value={heroBannerUrl}
                onChange={e => setHeroBannerUrl(e.target.value)}
                placeholder="https://example.com/banner.jpg"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Style Customization */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Brand Palette & Typography</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Brand Primary Color</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="h-9 w-12 rounded border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">Brand Accent/Secondary Color</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={e => setSecondaryColor(e.target.value)}
                    className="h-9 w-12 rounded border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={e => setSecondaryColor(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700">Font Typography</label>
              <select
                value={fontFamily}
                onChange={e => setFontFamily(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="Inter">Inter (Sleek/Modern)</option>
                <option value="Roboto">Roboto (Clean/Professional)</option>
                <option value="Outfit">Outfit (Geometric/Futuristic)</option>
                <option value="serif">Georgia (Classic Serif)</option>
              </select>
            </div>
          </div>

          {/* Social Links */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 border-b pb-2">Social Channels Footer Links</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Facebook Page URL</label>
                <input
                  type="text"
                  value={socialFacebook}
                  onChange={e => setSocialFacebook(e.target.value)}
                  placeholder="https://facebook.com/mycompany"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">Instagram Profile URL</label>
                <input
                  type="text"
                  value={socialInstagram}
                  onChange={e => setSocialInstagram(e.target.value)}
                  placeholder="https://instagram.com/mycompany"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">WhatsApp Chat Number</label>
                <input
                  type="text"
                  value={socialWhatsapp}
                  onChange={e => setSocialWhatsapp(e.target.value)}
                  placeholder="e.g. +919999999999"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview / Config raw status */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Appearance Details JSON</h2>
            <p className="text-xs text-gray-500">Live JSON representation of the configuration theme model.</p>
            <pre className="bg-gray-50 border p-3 rounded font-mono text-[10px] text-gray-700 overflow-x-auto whitespace-pre-wrap max-h-96">
              {JSON.stringify(getThemePayload(), null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
