// src/app/[company]/(user)/workspace/ecom-config/theme/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import Badge from "@/components/ui/badge/Badge";
import { useUser } from "@/context/CurrentUserContext";
import {
  StorefrontHeader,
  HomeSectionRenderer,
  StorefrontFooter,
  StorefrontTheme,
  NavItem,
  HomeSection,
  TenantOffer,
  TenantColor,
  TenantMaterial,
  CategoryType,
  StorefrontProduct,
  ShopByColorItem,
  ShopByMaterialItem,
  HeroSlide,
  AboutBlock,
  mockProducts,
  mockCategories,
  mockFooterSettings,
} from "@/components/storefront";
import ImageUploadInput from "@/components/ui/ImageUploadInput";
import ProductLookupModal from "@/components/product/ProductLookupModal";
import { useProductLookup } from "@/hooks/useProductLookup";
import type { ProductLookupItem } from "@/lib/product-lookup";
import { getGoogleFontUrl, getFontFamilyCss } from "@/lib/font-utils";
import {
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  EyeIcon,
  EyeSlashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PhotoIcon,
  SparklesIcon,
  SwatchIcon,
  Square3Stack3DIcon,
  TagIcon,
  InformationCircleIcon,
  QueueListIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/outline";

type ThemeConfig = {
  logo_url?: string;
  logo_image_id?: number;
  header_title?: string;
  hero_title?: string;
  hero_subtitle?: string;
  hero_banner_url?: string;
  hero_banner_image_id?: number;
  primary_color?: string;
  secondary_color?: string;
  social_facebook?: string;
  social_instagram?: string;
  social_whatsapp?: string;
  font_family?: string;
  layout_variant?: string;
  featured_category_ids?: number[];
  nav_items?: NavItem[];
  home_sections?: HomeSection[];
};

export const toStorefrontTheme = (
  config: ThemeConfig,
  resolvedImages: Record<number, string> = {}
): StorefrontTheme => ({
  primaryColor: config.primary_color || "#2563eb",
  secondaryColor: config.secondary_color || "#1e40af",
  logoUrl: (config.logo_image_id && resolvedImages[config.logo_image_id]) || config.logo_url || "",
  logoImageId: config.logo_image_id,
  headerTitle: config.header_title || "",
  bannerImages: config.hero_banner_image_id && resolvedImages[config.hero_banner_image_id]
    ? [resolvedImages[config.hero_banner_image_id]]
    : config.hero_banner_url
    ? [config.hero_banner_url]
    : [],
  bannerImageId: config.hero_banner_image_id,
  fontFamily: config.font_family || "Inter",
  layoutVariant: config.layout_variant || "standard",
  heroTitle: config.hero_title || "",
  heroDescription: config.hero_subtitle || "",
  socialLinks: {
    facebook: config.social_facebook || "",
    instagram: config.social_instagram || "",
    whatsapp: config.social_whatsapp || "",
  },
  featuredCategoryIds: config.featured_category_ids || [],
  navItems: config.nav_items || [],
  homeSections: config.home_sections || [],
});

export const fromStorefrontTheme = (theme: StorefrontTheme): ThemeConfig => ({
  logo_url: theme.logoUrl,
  logo_image_id: theme.logoImageId,
  header_title: theme.headerTitle || "",
  hero_title: theme.heroTitle,
  hero_subtitle: theme.heroDescription,
  hero_banner_url: theme.bannerImages?.[0] || "",
  hero_banner_image_id: theme.bannerImageId,
  primary_color: theme.primaryColor,
  secondary_color: theme.secondaryColor,
  font_family: theme.fontFamily,
  layout_variant: theme.layoutVariant || "standard",
  social_facebook: theme.socialLinks?.facebook,
  social_instagram: theme.socialLinks?.instagram,
  social_whatsapp: theme.socialLinks?.whatsapp,
  featured_category_ids: theme.featuredCategoryIds || [],
  nav_items: theme.navItems || [],
  home_sections: theme.homeSections || [],
});

export default function ThemeCustomizationPage() {
  const params = useParams();
  const company = (params.company as string) || "";
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Active editor tab
  const [activeTab, setActiveTab] = useState<"nav" | "sections" | "brand">("sections");

  // Branding states
  const [logoUrl, setLogoUrl] = useState("");
  const [logoImageId, setLogoImageId] = useState<number | undefined>();
  const [headerTitle, setHeaderTitle] = useState("");
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [heroBannerUrl, setHeroBannerUrl] = useState("");
  const [heroBannerImageId, setHeroBannerImageId] = useState<number | undefined>();
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [secondaryColor, setSecondaryColor] = useState("#1e40af");
  const [socialFacebook, setSocialFacebook] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialWhatsapp, setSocialWhatsapp] = useState("");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [layoutVariant, setLayoutVariant] = useState("standard");
  const [featuredCategoryIds, setFeaturedCategoryIds] = useState<number[]>([]);

  // Navigation and Homepage Sections state
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [homeSections, setHomeSections] = useState<HomeSection[]>([]);

  // Product Variant Lookup Modal state for ProductCarouselSection
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [activeCarouselSectionId, setActiveCarouselSectionId] = useState<string | null>(null);
  const [tempSelectedVariantIds, setTempSelectedVariantIds] = useState<number[]>([]);
  const [modalMaxLimit, setModalMaxLimit] = useState<number>(8);

  const productLookup = useProductLookup({
    lookupType: "carousel_lookup",
    enabled: isVariantModalOpen,
  });

  // Tenant entities from database
  const [workspaceCategories, setWorkspaceCategories] = useState<CategoryType[]>([]);
  const [workspaceColors, setWorkspaceColors] = useState<TenantColor[]>([]);
  const [workspaceMaterials, setWorkspaceMaterials] = useState<TenantMaterial[]>([]);
  const [workspaceOffers, setWorkspaceOffers] = useState<TenantOffer[]>([]);
  const [workspaceProducts, setWorkspaceProducts] = useState<StorefrontProduct[]>([]);
  const [imagesById, setImagesById] = useState<Record<number, string>>({});

  // Viewport mode for live preview frame
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">("desktop");

  // Publication info
  const [version, setVersion] = useState(0);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishedBy, setPublishedBy] = useState<string | null>(null);

  // Helper to extract all imageIds from config to batch resolve
  const collectImageIds = (config: ThemeConfig): number[] => {
    const ids = new Set<number>();
    if (config.logo_image_id) ids.add(config.logo_image_id);
    if (config.hero_banner_image_id) ids.add(config.hero_banner_image_id);

    (config.nav_items || []).forEach((item) => {
      (item.collections || []).forEach((col) => {
        if (col.imageId) ids.add(col.imageId);
      });
    });

    (config.home_sections || []).forEach((sec) => {
      if (sec.type === "hero_carousel") {
        sec.slides.forEach((s) => s.imageId && ids.add(s.imageId));
      } else if (sec.type === "shop_by_category" && sec.overrides) {
        Object.values(sec.overrides).forEach((ov) => ov?.imageId && ids.add(ov.imageId));
      } else if (sec.type === "shop_by_color") {
        sec.items.forEach((i) => i.imageId && ids.add(i.imageId));
      } else if (sec.type === "shop_by_material") {
        sec.items.forEach((i) => i.imageId && ids.add(i.imageId));
      } else if (sec.type === "offers" && sec.bannerImageId) {
        ids.add(sec.bannerImageId);
      } else if (sec.type === "about") {
        sec.blocks.forEach((b) => b.imageId && ids.add(b.imageId));
      }
    });

    return Array.from(ids);
  };

  const resolveImages = async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const res = await apiFetch(`/api/tenant/${company}/images?ids=${ids.join(",")}`, company);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.images)) {
          const newMap: Record<number, string> = {};
          data.images.forEach((img: any) => {
            newMap[img.id] = img.url || img.filePath;
          });
          setImagesById((prev) => ({ ...prev, ...newMap }));
        }
      }
    } catch (err) {
      console.error("Batch image resolution error:", err);
    }
  };

  useEffect(() => {
    if (!company) return;

    const loadAll = async () => {
      try {
        // 1. Fetch theme
        const themeRes = await apiFetch("/api/company/ecom-theme", company);
        let config: ThemeConfig = {};
        if (themeRes.ok) {
          const data = await themeRes.json();
          if (data.success && data.theme) {
            config = data.theme.draft_theme || {};
            setLogoUrl(config.logo_url || "");
            setLogoImageId(config.logo_image_id);
            setHeaderTitle(config.header_title || "");
            setHeroTitle(config.hero_title || "");
            setHeroSubtitle(config.hero_subtitle || "");
            setHeroBannerUrl(config.hero_banner_url || "");
            setHeroBannerImageId(config.hero_banner_image_id);
            setPrimaryColor(config.primary_color || "#2563eb");
            setSecondaryColor(config.secondary_color || "#1e40af");
            setSocialFacebook(config.social_facebook || "");
            setSocialInstagram(config.social_instagram || "");
            setSocialWhatsapp(config.social_whatsapp || "");
            setFontFamily(config.font_family || "Inter");
            setLayoutVariant(config.layout_variant || "standard");
            setFeaturedCategoryIds(config.featured_category_ids || []);
            setVersion(data.theme.version || 0);
            setPublishedAt(data.theme.published_at || null);
            setPublishedBy(data.theme.published_by || null);
            setIsSetupComplete(data.is_setup_complete === true);
          }
        }

        // 2. Fetch categories
        const catRes = await apiFetch(`/api/tenant/${company}/categories`, company);
        let loadedCats: CategoryType[] = [];
        if (catRes.ok) {
          const catData = await catRes.json();
          if (catData.success && Array.isArray(catData.categories)) {
            loadedCats = catData.categories;
            setWorkspaceCategories(loadedCats);
          }
        }

        // 3. Fetch colors
        const colorRes = await apiFetch(`/api/tenant/${company}/colors`, company);
        if (colorRes.ok) {
          const colorData = await colorRes.json();
          if (colorData.success && Array.isArray(colorData.colors)) {
            setWorkspaceColors(colorData.colors);
          }
        }

        // 4. Fetch materials
        const matRes = await apiFetch(`/api/tenant/${company}/materials`, company);
        if (matRes.ok) {
          const matData = await matRes.json();
          if (matData.success && Array.isArray(matData.materials)) {
            setWorkspaceMaterials(matData.materials);
          }
        }

        // 5. Fetch offers
        const offersRes = await apiFetch(`/api/tenant/${company}/offers`, company);
        if (offersRes.ok) {
          const offersData = await offersRes.json();
          if (offersData.success && Array.isArray(offersData.offers)) {
            setWorkspaceOffers(offersData.offers);
          }
        }

        // 6. Fetch products
        const prodRes = await apiFetch(`/api/tenant/${company}/products`, company);
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          if (prodData.success && Array.isArray(prodData.products)) {
            const mapped = prodData.products.map((p: any) => ({
              variantId: Number(p.id),
              name: p.products.name,
              category: p.products.category || "General",
              images: p.product_images || [],
              effectivePrice: Number(p.effective_price ?? p.product_pricing?.price ?? 0),
              inStock: Number(p.available_qty ?? 0) > 0,
            }));
            setWorkspaceProducts(mapped);
          }
        }

        // 7. Navigation items setup with default fallback
        if (config.nav_items && config.nav_items.length > 0) {
          setNavItems(config.nav_items);
        } else {
          const defaultNav: NavItem[] = [
            { id: "nav-cat-all", type: "category", label: "All Categories", enabled: true, order: 1 },
            { id: "nav-new", type: "new_arrivals", label: "New Arrivals", enabled: true, order: 2 },
            { id: "nav-offers", type: "offers", label: "Offers", enabled: true, order: 3 },
            { id: "nav-about", type: "about", label: "About", enabled: true, order: 4 },
          ];
          setNavItems(defaultNav);
        }

        // 8. Homepage sections setup with default fallback
        if (config.home_sections && config.home_sections.length > 0) {
          setHomeSections(config.home_sections);
        } else {
          const defaultSecs: HomeSection[] = [
            {
              id: "hero-1",
              type: "hero_carousel",
              enabled: true,
              order: 1,
              slides: [
                {
                  id: "slide-1",
                  title: config.hero_title || "Summer Luxury Collection",
                  subtitle: config.hero_subtitle || "Explore our exclusive handcrafted designs & seasonal deals",
                  imageUrl: config.hero_banner_url || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80",
                  buttonText: "Shop Catalog",
                  buttonLink: "/store/products",
                },
              ],
            },
            {
              id: "cat-1",
              type: "shop_by_category",
              enabled: true,
              order: 2,
              title: "Shop by Category",
              subtitle: "Curated collections for every occasion",
              categoryIds: loadedCats.slice(0, 4).map((c) => Number(c.id)),
            },
            {
              id: "prod-1",
              type: "product_carousel",
              enabled: true,
              order: 3,
              title: "New Arrivals",
              subtitle: "Fresh styles just landed in store",
              limit: 8,
            },
          ];
          setHomeSections(defaultSecs);
        }

        // 9. Resolve image IDs
        const imageIdsToResolve = collectImageIds(config);
        if (imageIdsToResolve.length > 0) {
          await resolveImages(imageIdsToResolve);
        }
      } catch (err) {
        console.error("Failed to load storefront theme details:", err);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [company]);

  // Client-side dynamic preview Google Font loading
  useEffect(() => {
    const fontUrl = getGoogleFontUrl(fontFamily);
    if (!fontUrl) return;

    let link = document.getElementById("theme-editor-google-font") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.id = "theme-editor-google-font";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = fontUrl;
  }, [fontFamily]);

  const getThemePayload = (): ThemeConfig => {
    return {
      logo_url: logoUrl,
      logo_image_id: logoImageId,
      header_title: headerTitle,
      hero_title: heroTitle,
      hero_subtitle: heroSubtitle,
      hero_banner_url: heroBannerUrl,
      hero_banner_image_id: heroBannerImageId,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      social_facebook: socialFacebook,
      social_instagram: socialInstagram,
      social_whatsapp: socialWhatsapp,
      font_family: fontFamily,
      layout_variant: layoutVariant,
      featured_category_ids: featuredCategoryIds,
      nav_items: navItems,
      home_sections: homeSections,
    };
  };

  const liveStorefrontTheme: StorefrontTheme = toStorefrontTheme(getThemePayload(), imagesById);

  const handleSaveDraft = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/company/ecom-theme", company, {
        method: "POST",
        body: JSON.stringify({
          draft_theme: getThemePayload(),
        }),
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
      setMessage({
        type: "error",
        text: "Please complete payment and shipping settings in Store Settings first before publishing.",
      });
      return;
    }

    setPublishing(true);
    setMessage(null);
    try {
      await apiFetch("/api/company/ecom-theme", company, {
        method: "POST",
        body: JSON.stringify({
          draft_theme: getThemePayload(),
        }),
      });

      const res = await apiFetch("/api/company/ecom-theme?action=publish", company, {
        method: "POST",
        body: JSON.stringify({
          publisher: user?.email || user?.name || "Workspace User",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setVersion(data.version);
        setPublishedAt(new Date().toISOString());
        setPublishedBy(user?.email || user?.name || "Workspace User");
        setMessage({
          type: "success",
          text: "Congratulations! Storefront appearance and sections have been published live!",
        });
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

  // Section Management Handlers
  const addHomeSection = (type: HomeSection["type"]) => {
    const newOrder = homeSections.length + 1;
    const newId = `sec-${type}-${Date.now()}`;
    let newSection: HomeSection;

    switch (type) {
      case "hero_carousel":
        newSection = {
          id: newId,
          type: "hero_carousel",
          enabled: true,
          order: newOrder,
          slides: [
            {
              id: `slide-${Date.now()}`,
              title: "Discover New Styles",
              subtitle: "Premium quality crafted for comfort and elegance",
              buttonText: "Shop Now",
              buttonLink: "/store/products",
            },
          ],
        };
        break;
      case "shop_by_category":
        newSection = {
          id: newId,
          type: "shop_by_category",
          enabled: true,
          order: newOrder,
          title: "Shop by Category",
          categoryIds: workspaceCategories.slice(0, 4).map((c) => Number(c.id)),
        };
        break;
      case "shop_by_color":
        newSection = {
          id: newId,
          type: "shop_by_color",
          enabled: true,
          order: newOrder,
          title: "Shop by Color",
          items: workspaceColors.slice(0, 6).map((c) => ({
            id: `color-${c.id}`,
            colorId: c.id,
            label: c.name,
          })),
        };
        break;
      case "shop_by_material":
        newSection = {
          id: newId,
          type: "shop_by_material",
          enabled: true,
          order: newOrder,
          title: "Shop by Material",
          items: workspaceMaterials.slice(0, 4).map((m) => ({
            id: `mat-${m.id}`,
            materialId: m.id,
            label: m.name,
          })),
        };
        break;
      case "product_carousel":
        newSection = {
          id: newId,
          type: "product_carousel",
          enabled: true,
          order: newOrder,
          title: "Featured Products",
          limit: 8,
          productVariantIds: [],
        };
        break;
      case "offers":
        newSection = {
          id: newId,
          type: "offers",
          enabled: true,
          order: newOrder,
          title: "Special Deals & Discounts",
          discountIds: workspaceOffers.slice(0, 3).map((o) => o.id),
        };
        break;
      case "about":
        newSection = {
          id: newId,
          type: "about",
          enabled: true,
          order: newOrder,
          title: "About Our Brand",
          blocks: [
            {
              id: `block-${Date.now()}`,
              heading: "Crafted with Passion",
              body: "We blend timeless design with modern craftsmanship to deliver products you will love.",
              imagePosition: "left",
            },
          ],
        };
        break;
    }

    setHomeSections([...homeSections, newSection]);
  };

  const removeHomeSection = (id: string) => {
    setHomeSections(homeSections.filter((s) => s.id !== id));
  };

  const toggleHomeSection = (id: string) => {
    setHomeSections(
      homeSections.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const moveHomeSection = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= homeSections.length) return;
    const updated = [...homeSections];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    updated.forEach((s, idx) => (s.order = idx + 1));
    setHomeSections(updated);
  };

  // Nav Items Management Handlers
  const addNavItem = (type: NavItem["type"]) => {
    const newOrder = navItems.length + 1;
    const newId = `nav-${type}-${Date.now()}`;
    let newItem: NavItem;

    switch (type) {
      case "all_categories":
        newItem = {
          id: newId,
          type: "all_categories",
          label: "All Categories",
          enabled: true,
          order: newOrder,
        };
        break;
      case "category":
        newItem = {
          id: newId,
          type: "category",
          label: workspaceCategories[0]?.name || "Category",
          categoryId: workspaceCategories[0] ? Number(workspaceCategories[0].id) : undefined,
          enabled: true,
          order: newOrder,
        };
        break;
      case "new_arrivals":
        newItem = { id: newId, type: "new_arrivals", label: "New Arrivals", enabled: true, order: newOrder };
        break;
      case "offers":
        newItem = { id: newId, type: "offers", label: "Offers", enabled: true, order: newOrder };
        break;
      case "about":
        newItem = { id: newId, type: "about", label: "About Us", enabled: true, order: newOrder };
        break;
      case "more":
        newItem = {
          id: newId,
          type: "more",
          label: "Shop By Collections",
          enabled: true,
          order: newOrder,
          collections: [
            ...workspaceColors.slice(0, 3).map((c) => ({
              id: `col-color-${c.id}`,
              kind: "color" as const,
              colorId: c.id,
              label: `Color: ${c.name}`,
            })),
            ...workspaceMaterials.slice(0, 2).map((m) => ({
              id: `col-mat-${m.id}`,
              kind: "material" as const,
              materialId: m.id,
              label: `Material: ${m.name}`,
            })),
          ],
        };
        break;
      case "custom_link":
        newItem = {
          id: newId,
          type: "custom_link",
          label: "Customer Support",
          customUrl: "/store/account",
          enabled: true,
          order: newOrder,
        };
        break;
    }

    setNavItems([...navItems, newItem]);
  };

  const removeNavItem = (id: string) => {
    setNavItems(navItems.filter((i) => i.id !== id));
  };

  const toggleNavItem = (id: string) => {
    setNavItems(
      navItems.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i))
    );
  };

  const moveNavItem = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= navItems.length) return;
    const updated = [...navItems];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    updated.forEach((i, idx) => (i.order = idx + 1));
    setNavItems(updated);
  };

  // Carousel Variant Modal Handlers
  const handleOpenVariantLookup = (sectionId: string, currentVariantIds: number[] = [], limit: number = 8) => {
    setActiveCarouselSectionId(sectionId);
    setTempSelectedVariantIds([...currentVariantIds]);
    setModalMaxLimit(limit);
    setIsVariantModalOpen(true);
  };

  const handleToggleVariantSelection = (item: ProductLookupItem) => {
    const vId = Number(item.variant_id);
    if (tempSelectedVariantIds.includes(vId)) {
      setTempSelectedVariantIds(tempSelectedVariantIds.filter((id) => id !== vId));
    } else {
      if (tempSelectedVariantIds.length >= modalMaxLimit) return;
      setTempSelectedVariantIds([...tempSelectedVariantIds, vId]);
    }
  };

  const handleToggleAllVariants = (checked: boolean, pageItems: ProductLookupItem[]) => {
    if (!checked) {
      const pageVariantIds = new Set(pageItems.map((p) => Number(p.variant_id)));
      setTempSelectedVariantIds(tempSelectedVariantIds.filter((id) => !pageVariantIds.has(id)));
    } else {
      const needed = modalMaxLimit - tempSelectedVariantIds.length;
      if (needed <= 0) return;
      const newToAdd: number[] = [];
      for (const item of pageItems) {
        const vId = Number(item.variant_id);
        if (!tempSelectedVariantIds.includes(vId) && !newToAdd.includes(vId)) {
          newToAdd.push(vId);
          if (newToAdd.length >= needed) break;
        }
      }
      setTempSelectedVariantIds([...tempSelectedVariantIds, ...newToAdd]);
    }
  };

  const handleSaveVariantSelection = () => {
    if (!activeCarouselSectionId) return;
    setHomeSections(
      homeSections.map((s) =>
        s.id === activeCarouselSectionId && s.type === "product_carousel"
          ? { ...s, productVariantIds: tempSelectedVariantIds }
          : s
      )
    );
    setIsVariantModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500 font-medium">
        Loading storefront theme configuration...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="space-y-1">
          <Badge variant="light" color={version > 0 ? "success" : "warning"}>
            {version > 0 ? `Live: Version ${version}` : "Draft: Not Published"}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Customize Storefront & Sections
          </h1>
          <p className="text-sm text-gray-600">
            Configure header navigation, dynamic homepage sections, branding palette, and publish live to customers.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving Draft..." : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || saving}
            className="rounded-md bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-600 focus:outline-none disabled:opacity-50 cursor-pointer"
          >
            {publishing ? "Publishing Storefront..." : "Publish Live Storefront"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Published Snapshot Notice */}
      {version > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/20 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-blue-900 text-sm">Active Live Storefront Snapshot</h3>
            <p className="text-xs text-blue-700">
              Published at: {publishedAt ? new Date(publishedAt).toLocaleString() : "N/A"} by {publishedBy || "System"}
            </p>
          </div>
          <a
            href={`/${company}/store`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-xs"
          >
            Open Live Storefront ↗
          </a>
        </div>
      )}

      {/* Main 2-Column Editor Layout: Controls Left, Live Preview Right */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Column: Configuration Panels (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-200 bg-gray-50/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab("sections")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === "sections"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <Square3Stack3DIcon className="h-4 w-4" />
              <span>Homepage Sections</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("nav")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === "nav"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <QueueListIcon className="h-4 w-4" />
              <span>Header Navigation</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("brand")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === "brand"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <PaintBrushIcon className="h-4 w-4" />
              <span>Branding & Style</span>
            </button>
          </div>

          {/* TAB 1: HOMEPAGE SECTIONS */}
          {activeTab === "sections" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Homepage Section Stack</h2>
                  <p className="text-xs text-gray-500">Enable, reorder, and configure sections rendered on homepage.</p>
                </div>
              </div>

              {/* Add Section Dropdown / Buttons */}
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-xs font-semibold text-gray-600 self-center">Add:</span>
                <button
                  type="button"
                  onClick={() => addHomeSection("hero_carousel")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Hero Carousel
                </button>
                <button
                  type="button"
                  onClick={() => addHomeSection("shop_by_category")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Shop by Category
                </button>
                <button
                  type="button"
                  onClick={() => addHomeSection("shop_by_color")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Shop by Color
                </button>
                <button
                  type="button"
                  onClick={() => addHomeSection("shop_by_material")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Shop by Material
                </button>
                <button
                  type="button"
                  onClick={() => addHomeSection("product_carousel")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Product Carousel
                </button>
                <button
                  type="button"
                  onClick={() => addHomeSection("offers")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Live Offers
                </button>
                <button
                  type="button"
                  onClick={() => addHomeSection("about")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + About Us
                </button>
              </div>

              {/* Section Items List */}
              <div className="space-y-3">
                {homeSections.map((sec, idx) => (
                  <div
                    key={sec.id}
                    className={`rounded-xl border bg-white p-4 shadow-xs transition-all ${
                      sec.enabled ? "border-gray-200" : "border-gray-200 bg-gray-50/50 opacity-75"
                    }`}
                  >
                    {/* Header bar of the section */}
                    <div className="flex items-center justify-between border-b pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleHomeSection(sec.id)}
                          className={`p-1 rounded cursor-pointer ${
                            sec.enabled ? "text-emerald-600 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-100"
                          }`}
                          title={sec.enabled ? "Enabled (Click to disable)" : "Disabled (Click to enable)"}
                        >
                          {sec.enabled ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                        </button>
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                          {sec.type.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs font-semibold text-gray-800">
                          {(sec as any).title || "Hero Banner"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveHomeSection(idx, "up")}
                          className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                          title="Move up"
                        >
                          <ChevronUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === homeSections.length - 1}
                          onClick={() => moveHomeSection(idx, "down")}
                          className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                          title="Move down"
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeHomeSection(sec.id)}
                          className="p-1 text-gray-400 hover:text-red-600 cursor-pointer"
                          title="Remove section"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Section Specific Config Body */}
                    {sec.type === "hero_carousel" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-700">Hero Slides ({sec.slides.length})</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = homeSections.map((s) =>
                                s.id === sec.id && s.type === "hero_carousel"
                                  ? {
                                      ...s,
                                      slides: [
                                        ...s.slides,
                                        {
                                          id: `slide-${Date.now()}`,
                                          title: "New Slide Title",
                                          subtitle: "Slide description goes here",
                                          buttonText: "Explore",
                                          buttonLink: "/store/products",
                                        },
                                      ],
                                    }
                                  : s
                              );
                              setHomeSections(updated);
                            }}
                            className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                          >
                            + Add Slide
                          </button>
                        </div>

                        {sec.slides.map((slide, sIdx) => (
                          <div key={slide.id} className="p-3 bg-gray-50 rounded-lg space-y-2.5 border border-gray-100">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-600">Slide #{sIdx + 1}</span>
                              {sec.slides.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = homeSections.map((s) =>
                                      s.id === sec.id && s.type === "hero_carousel"
                                        ? {
                                            ...s,
                                            slides: s.slides.filter((item) => item.id !== slide.id),
                                          }
                                        : s
                                    );
                                    setHomeSections(updated);
                                  }}
                                  className="text-xs text-red-500 hover:underline cursor-pointer"
                                >
                                  Delete
                                </button>
                              )}
                            </div>

                            <input
                              type="text"
                              value={slide.title || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = homeSections.map((s) =>
                                  s.id === sec.id && s.type === "hero_carousel"
                                    ? {
                                        ...s,
                                        slides: s.slides.map((item) =>
                                          item.id === slide.id ? { ...item, title: val } : item
                                        ),
                                      }
                                    : s
                                );
                                setHomeSections(updated);
                              }}
                              placeholder="Slide Title (e.g. Summer Sale)"
                              className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                            />

                            <input
                              type="text"
                              value={slide.subtitle || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = homeSections.map((s) =>
                                  s.id === sec.id && s.type === "hero_carousel"
                                    ? {
                                        ...s,
                                        slides: s.slides.map((item) =>
                                          item.id === slide.id ? { ...item, subtitle: val } : item
                                        ),
                                      }
                                    : s
                                );
                                setHomeSections(updated);
                              }}
                              placeholder="Slide Subtitle / Description"
                              className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                            />

                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={slide.buttonText || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = homeSections.map((s) =>
                                    s.id === sec.id && s.type === "hero_carousel"
                                      ? {
                                          ...s,
                                          slides: s.slides.map((item) =>
                                            item.id === slide.id ? { ...item, buttonText: val } : item
                                          ),
                                        }
                                      : s
                                  );
                                  setHomeSections(updated);
                                }}
                                placeholder="CTA Button Text"
                                className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                              />
                              <input
                                type="text"
                                value={slide.buttonLink || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = homeSections.map((s) =>
                                    s.id === sec.id && s.type === "hero_carousel"
                                      ? {
                                          ...s,
                                          slides: s.slides.map((item) =>
                                            item.id === slide.id ? { ...item, buttonLink: val } : item
                                          ),
                                        }
                                      : s
                                  );
                                  setHomeSections(updated);
                                }}
                                placeholder="Button Link URL"
                                className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                              />
                            </div>

                            <ImageUploadInput
                              label="Slide Background Image"
                              value={(slide.imageId && imagesById[slide.imageId]) || slide.imageUrl || ""}
                              onChange={(url, imageId) => {
                                if (imageId) setImagesById((prev) => ({ ...prev, [imageId]: url }));
                                const updated = homeSections.map((s) =>
                                  s.id === sec.id && s.type === "hero_carousel"
                                    ? {
                                        ...s,
                                        slides: s.slides.map((item) =>
                                          item.id === slide.id
                                            ? { ...item, imageUrl: url, imageId: imageId || item.imageId }
                                            : item
                                        ),
                                      }
                                    : s
                                );
                                setHomeSections(updated);
                              }}
                              company={company}
                              source="hero_slide"
                              assetType="hero_slide"
                              placeholder="Upload or paste image URL"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {sec.type === "shop_by_category" && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={sec.title || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHomeSections(homeSections.map((s) => (s.id === sec.id ? { ...s, title: val } : s)));
                          }}
                          placeholder="Section Title"
                          className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                        />

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Select Categories ({sec.categoryIds?.length || 0} chosen)
                          </label>
                          <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-200 rounded p-2 bg-gray-50 text-xs">
                            {workspaceCategories.map((c) => {
                              const cId = Number(c.id);
                              const checked = sec.categoryIds?.includes(cId);
                              return (
                                <label key={cId} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const newIds = e.target.checked
                                        ? [...(sec.categoryIds || []), cId]
                                        : (sec.categoryIds || []).filter((id) => id !== cId);
                                      setHomeSections(
                                        homeSections.map((s) =>
                                          s.id === sec.id && s.type === "shop_by_category"
                                            ? { ...s, categoryIds: newIds }
                                            : s
                                        )
                                      );
                                    }}
                                  />
                                  <span>{c.path_string || c.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {sec.type === "shop_by_color" && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={sec.title || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHomeSections(homeSections.map((s) => (s.id === sec.id ? { ...s, title: val } : s)));
                          }}
                          placeholder="Section Title (e.g. Shop by Color)"
                          className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                        />

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Choose Colors to Feature
                          </label>
                          <div className="max-h-44 overflow-y-auto space-y-1.5 border border-gray-200 rounded p-2 bg-gray-50 text-xs">
                            {workspaceColors.map((color) => {
                              const existing = sec.items?.find((i) => i.colorId === color.id);
                              const checked = Boolean(existing);
                              return (
                                <div key={color.id} className="flex items-center justify-between p-1 hover:bg-gray-100 rounded">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        let newItems: ShopByColorItem[] = [...(sec.items || [])];
                                        if (e.target.checked) {
                                          newItems.push({
                                            id: `col-${color.id}`,
                                            colorId: color.id,
                                            label: color.name,
                                          });
                                        } else {
                                          newItems = newItems.filter((i) => i.colorId !== color.id);
                                        }
                                        setHomeSections(
                                          homeSections.map((s) =>
                                            s.id === sec.id && s.type === "shop_by_color"
                                              ? { ...s, items: newItems }
                                              : s
                                          )
                                        );
                                      }}
                                    />
                                    <span
                                      className="h-3 w-3 rounded-full border border-black/20"
                                      style={{ backgroundColor: color.hexCode || "#000" }}
                                    />
                                    <span>{color.name}</span>
                                  </label>

                                  {checked && (
                                    <ImageUploadInput
                                      label=""
                                      value={(existing?.imageId && imagesById[existing.imageId]) || existing?.imageUrl || ""}
                                      onChange={(url, imageId) => {
                                        if (imageId) setImagesById((prev) => ({ ...prev, [imageId]: url }));
                                        const newItems: ShopByColorItem[] = (sec.items || []).map((i) =>
                                          i.colorId === color.id
                                            ? { ...i, imageUrl: url, imageId: imageId || i.imageId }
                                            : i
                                        );
                                        setHomeSections(
                                          homeSections.map((s) =>
                                            s.id === sec.id && s.type === "shop_by_color"
                                              ? { ...s, items: newItems }
                                              : s
                                          )
                                        );
                                      }}
                                      company={company}
                                      colorId={color.id}
                                      source="shop_by_color_thumbnail"
                                      assetType="color_thumbnail"
                                      placeholder="Upload swatch thumbnail"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {sec.type === "shop_by_material" && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={sec.title || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHomeSections(homeSections.map((s) => (s.id === sec.id ? { ...s, title: val } : s)));
                          }}
                          placeholder="Section Title (e.g. Shop by Material)"
                          className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                        />

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Choose Materials to Feature
                          </label>
                          <div className="max-h-44 overflow-y-auto space-y-1.5 border border-gray-200 rounded p-2 bg-gray-50 text-xs">
                            {workspaceMaterials.map((mat) => {
                              const existing = sec.items?.find((i) => i.materialId === mat.id);
                              const checked = Boolean(existing);
                              return (
                                <div key={mat.id} className="flex items-center justify-between p-1 hover:bg-gray-100 rounded">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        let newItems: ShopByMaterialItem[] = [...(sec.items || [])];
                                        if (e.target.checked) {
                                          newItems.push({
                                            id: `mat-${mat.id}`,
                                            materialId: mat.id,
                                            label: mat.name,
                                          });
                                        } else {
                                          newItems = newItems.filter((i) => i.materialId !== mat.id);
                                        }
                                        setHomeSections(
                                          homeSections.map((s) =>
                                            s.id === sec.id && s.type === "shop_by_material"
                                              ? { ...s, items: newItems }
                                              : s
                                          )
                                        );
                                      }}
                                    />
                                    <span>{mat.name}</span>
                                  </label>

                                  {checked && (
                                    <ImageUploadInput
                                      label=""
                                      value={(existing?.imageId && imagesById[existing.imageId]) || existing?.imageUrl || ""}
                                      onChange={(url, imageId) => {
                                        if (imageId) setImagesById((prev) => ({ ...prev, [imageId]: url }));
                                        const newItems: ShopByMaterialItem[] = (sec.items || []).map((i) =>
                                          i.materialId === mat.id
                                            ? { ...i, imageUrl: url, imageId: imageId || i.imageId }
                                            : i
                                        );
                                        setHomeSections(
                                          homeSections.map((s) =>
                                            s.id === sec.id && s.type === "shop_by_material"
                                              ? { ...s, items: newItems }
                                              : s
                                          )
                                        );
                                      }}
                                      company={company}
                                      materialId={mat.id}
                                      source="shop_by_material_thumbnail"
                                      assetType="material_thumbnail"
                                      placeholder="Upload material thumbnail"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {sec.type === "product_carousel" && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={sec.title || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHomeSections(homeSections.map((s) => (s.id === sec.id ? { ...s, title: val } : s)));
                          }}
                          placeholder="Section Title (e.g. Featured Products / New Arrivals)"
                          className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                        />

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="block font-semibold text-gray-700 mb-1">
                              Product Variants ({(sec.productVariantIds || []).length} / {sec.limit || 8} max)
                            </label>
                            <button
                              type="button"
                              onClick={() => handleOpenVariantLookup(sec.id, sec.productVariantIds || [], sec.limit || 8)}
                              className="w-full inline-flex items-center justify-center gap-1.5 rounded border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer shadow-xs"
                            >
                              <PlusIcon className="h-3.5 w-3.5" />
                              <span>{(sec.productVariantIds || []).length > 0 ? "Edit Variants" : "Select Variants"}</span>
                            </button>
                          </div>

                          <div>
                            <label className="block font-semibold text-gray-700 mb-1">Max Products Displayed</label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={sec.limit || 8}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 8;
                                setHomeSections(
                                  homeSections.map((s) =>
                                    s.id === sec.id && s.type === "product_carousel"
                                      ? {
                                          ...s,
                                          limit: val,
                                          productVariantIds: (s.productVariantIds || []).slice(0, val),
                                        }
                                      : s
                                  )
                                );
                              }}
                              className="w-full rounded border border-gray-300 p-1.5 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Selected Variants List Preview Chips */}
                        {(sec.productVariantIds || []).length > 0 && (
                          <div className="space-y-1 pt-1">
                            <span className="text-[11px] font-semibold text-gray-500">Selected Variants ({sec.productVariantIds?.length}):</span>
                            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 bg-gray-50 rounded-lg border border-gray-200">
                              {sec.productVariantIds?.map((vId) => {
                                const foundProd = workspaceProducts.find((p) => p.variantId === vId);
                                const foundLookup = productLookup.items.find((it) => it.variant_id === vId);
                                const label = foundProd?.name || foundLookup?.name || `Variant #${vId}`;
                                const sku = foundLookup?.sku || "";

                                return (
                                  <span
                                    key={vId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white text-gray-800 border border-gray-300 shadow-xs"
                                  >
                                    <span className="truncate max-w-[140px]">{label}{sku ? ` (${sku})` : ""}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedIds = (sec.productVariantIds || []).filter((id) => id !== vId);
                                        setHomeSections(
                                          homeSections.map((s) =>
                                            s.id === sec.id && s.type === "product_carousel"
                                              ? { ...s, productVariantIds: updatedIds }
                                              : s
                                          )
                                        );
                                      }}
                                      className="text-gray-400 hover:text-red-500 font-bold ml-0.5 cursor-pointer"
                                      title="Remove variant"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {sec.type === "offers" && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={sec.title || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHomeSections(homeSections.map((s) => (s.id === sec.id ? { ...s, title: val } : s)));
                          }}
                          placeholder="Section Title (e.g. Special Deals & Offers)"
                          className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                        />

                        <ImageUploadInput
                          label="Optional Promo Banner Image"
                          value={(sec.bannerImageId && imagesById[sec.bannerImageId]) || sec.bannerImageUrl || ""}
                          onChange={(url, imageId) => {
                            if (imageId) setImagesById((prev) => ({ ...prev, [imageId]: url }));
                            setHomeSections(
                              homeSections.map((s) =>
                                s.id === sec.id && s.type === "offers"
                                  ? { ...s, bannerImageUrl: url, bannerImageId: imageId || s.bannerImageId }
                                  : s
                              )
                            );
                          }}
                          company={company}
                          source="offer_banner"
                          assetType="banner"
                          placeholder="Upload promo banner"
                        />

                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Select Active Discounts (Text is live from discounts table)
                          </label>
                          {workspaceOffers.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No active ecom discounts found in discounts table.</p>
                          ) : (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 border border-gray-200 rounded p-2 bg-gray-50 text-xs">
                              {workspaceOffers.map((offer) => {
                                const checked = sec.discountIds?.includes(offer.id);
                                return (
                                  <label key={offer.id} className="flex items-start gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const newIds = e.target.checked
                                          ? [...(sec.discountIds || []), offer.id]
                                          : (sec.discountIds || []).filter((id) => id !== offer.id);
                                        setHomeSections(
                                          homeSections.map((s) =>
                                            s.id === sec.id && s.type === "offers"
                                              ? { ...s, discountIds: newIds }
                                              : s
                                          )
                                        );
                                      }}
                                      className="mt-0.5"
                                    />
                                    <div>
                                      <span className="font-semibold text-gray-800">{offer.title}</span>
                                      <span className="text-gray-500 ml-1.5">
                                        ({offer.discountType === "percentage" ? `${offer.discountValue}%` : `$${offer.discountValue}`})
                                      </span>
                                      {offer.description && (
                                        <p className="text-[11px] text-gray-400 line-clamp-1">{offer.description}</p>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {sec.type === "about" && (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={sec.title || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHomeSections(homeSections.map((s) => (s.id === sec.id ? { ...s, title: val } : s)));
                          }}
                          placeholder="Section Title (e.g. About Our Brand)"
                          className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                        />

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">Story Blocks ({sec.blocks.length})</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = homeSections.map((s) =>
                                  s.id === sec.id && s.type === "about"
                                    ? {
                                        ...s,
                                        blocks: [
                                          ...s.blocks,
                                          {
                                            id: `block-${Date.now()}`,
                                            heading: "Our Mission",
                                            body: "We are committed to exceptional quality.",
                                            imagePosition: "left" as const,
                                          },
                                        ],
                                      }
                                    : s
                                );
                                setHomeSections(updated);
                              }}
                              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                            >
                              + Add Block
                            </button>
                          </div>

                          {sec.blocks.map((b, bIdx) => (
                            <div key={b.id} className="p-3 bg-gray-50 rounded-lg space-y-2 border border-gray-100">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-600">Block #{bIdx + 1}</span>
                                {sec.blocks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = homeSections.map((s) =>
                                        s.id === sec.id && s.type === "about"
                                          ? {
                                              ...s,
                                              blocks: s.blocks.filter((item) => item.id !== b.id),
                                            }
                                          : s
                                      );
                                      setHomeSections(updated);
                                    }}
                                    className="text-xs text-red-500 hover:underline cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>

                              <input
                                type="text"
                                value={b.heading || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = homeSections.map((s) =>
                                    s.id === sec.id && s.type === "about"
                                      ? {
                                          ...s,
                                          blocks: s.blocks.map((item) =>
                                            item.id === b.id ? { ...item, heading: val } : item
                                          ),
                                        }
                                      : s
                                  );
                                  setHomeSections(updated);
                                }}
                                placeholder="Block Heading"
                                className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                              />

                              <textarea
                                rows={2}
                                value={b.body || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = homeSections.map((s) =>
                                    s.id === sec.id && s.type === "about"
                                      ? {
                                          ...s,
                                          blocks: s.blocks.map((item) =>
                                            item.id === b.id ? { ...item, body: val } : item
                                          ),
                                        }
                                      : s
                                  );
                                  setHomeSections(updated);
                                }}
                                placeholder="Story content / body text..."
                                className="w-full text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                              />

                              <div className="flex gap-2">
                                <select
                                  value={b.imagePosition || "left"}
                                  onChange={(e) => {
                                    const val = e.target.value as "left" | "right";
                                    const updated = homeSections.map((s) =>
                                      s.id === sec.id && s.type === "about"
                                        ? {
                                            ...s,
                                            blocks: s.blocks.map((item) =>
                                              item.id === b.id ? { ...item, imagePosition: val } : item
                                            ),
                                          }
                                        : s
                                    );
                                    setHomeSections(updated);
                                  }}
                                  className="text-xs rounded border border-gray-300 p-1.5 focus:outline-none"
                                >
                                  <option value="left">Image on Left</option>
                                  <option value="right">Image on Right</option>
                                </select>
                              </div>

                              <ImageUploadInput
                                label="Story Image"
                                value={(b.imageId && imagesById[b.imageId]) || b.imageUrl || ""}
                                onChange={(url, imageId) => {
                                  if (imageId) setImagesById((prev) => ({ ...prev, [imageId]: url }));
                                  const updated = homeSections.map((s) =>
                                    s.id === sec.id && s.type === "about"
                                      ? {
                                          ...s,
                                          blocks: s.blocks.map((item) =>
                                            item.id === b.id
                                              ? { ...item, imageUrl: url, imageId: imageId || item.imageId }
                                              : item
                                          ),
                                        }
                                      : s
                                  );
                                  setHomeSections(updated);
                                }}
                                company={company}
                                source="about_block"
                                assetType="about"
                                placeholder="Upload story image"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: HEADER NAVIGATION */}
          {activeTab === "nav" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Header Navigation Menu</h2>
                  <p className="text-xs text-gray-500">
                    Configure top menu items: categories, deals, about, and custom links.
                  </p>
                </div>
              </div>

              {/* Add Nav Item Controls */}
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-xs font-semibold text-gray-600 self-center">Add:</span>
                <button
                  type="button"
                  onClick={() => addNavItem("all_categories")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + All Categories
                </button>
                <button
                  type="button"
                  onClick={() => addNavItem("category")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Category Link
                </button>
                <button
                  type="button"
                  onClick={() => addNavItem("new_arrivals")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + New Arrivals
                </button>
                <button
                  type="button"
                  onClick={() => addNavItem("offers")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Offers Link
                </button>
                <button
                  type="button"
                  onClick={() => addNavItem("about")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + About Link
                </button>
                <button
                  type="button"
                  onClick={() => addNavItem("more")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + More Dropdown
                </button>
                <button
                  type="button"
                  onClick={() => addNavItem("custom_link")}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer shadow-xs"
                >
                  + Custom URL
                </button>
              </div>

              {/* Nav Items List */}
              <div className="space-y-3">
                {navItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border bg-white p-3.5 shadow-xs transition-all ${
                      item.enabled ? "border-gray-200" : "border-gray-200 bg-gray-50 opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleNavItem(item.id)}
                          className={`p-1 rounded cursor-pointer ${
                            item.enabled ? "text-emerald-600 hover:bg-emerald-50" : "text-gray-400 hover:bg-gray-100"
                          }`}
                        >
                          {item.enabled ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                        </button>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                          {item.type}
                        </span>
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNavItems(navItems.map((i) => (i.id === item.id ? { ...i, label: val } : i)));
                          }}
                          className="text-xs font-semibold text-gray-800 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveNavItem(idx, "up")}
                          className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === navItems.length - 1}
                          onClick={() => moveNavItem(idx, "down")}
                          className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeNavItem(item.id)}
                          className="p-1 text-gray-400 hover:text-red-600 cursor-pointer"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Nav Item Sub-Config */}
                    {item.type === "category" && (
                      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 text-xs">
                        <label className="text-gray-500">Target Category:</label>
                        <select
                          value={item.categoryId ? String(item.categoryId) : "all"}
                          onChange={(e) => {
                            const valStr = e.target.value;
                            if (valStr === "all" || !valStr) {
                              setNavItems(
                                navItems.map((i) =>
                                  i.id === item.id
                                    ? { ...i, categoryId: undefined, label: "All Categories" }
                                    : i
                                )
                              );
                            } else {
                              const val = Number(valStr);
                              const foundCat = workspaceCategories.find((c) => Number(c.id) === val);
                              setNavItems(
                                navItems.map((i) =>
                                  i.id === item.id
                                    ? { ...i, categoryId: val, label: foundCat?.name || i.label }
                                    : i
                                )
                              );
                            }
                          }}
                          className="rounded border border-gray-300 p-1 text-xs focus:outline-none"
                        >
                          <option value="all">All Categories (All Products)</option>
                          {workspaceCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.path_string || c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {item.type === "custom_link" && (
                      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 text-xs">
                        <label className="text-gray-500">URL:</label>
                        <input
                          type="text"
                          value={item.customUrl || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNavItems(navItems.map((i) => (i.id === item.id ? { ...i, customUrl: val } : i)));
                          }}
                          placeholder="e.g. /store/products or https://..."
                          className="flex-1 rounded border border-gray-300 p-1 text-xs focus:outline-none"
                        />
                      </div>
                    )}

                    {item.type === "more" && (
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-2 text-xs">
                        <div className="text-gray-500 font-medium">Dropdown Collection Items:</div>
                        <div className="space-y-1 pl-2">
                          {(item.collections || []).map((col, cIdx) => (
                            <div key={col.id || cIdx} className="flex items-center justify-between text-xs py-0.5">
                              <span className="font-semibold text-gray-700">
                                [{col.kind}] {col.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedCols = (item.collections || []).filter((_, i) => i !== cIdx);
                                  setNavItems(
                                    navItems.map((i) =>
                                      i.id === item.id ? { ...i, collections: updatedCols } : i
                                    )
                                  );
                                }}
                                className="text-red-500 hover:underline cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: BRANDING & PALETTE */}
          {activeTab === "brand" && (
            <div className="space-y-6">
              {/* Logo & Header Title */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-4">
                <h2 className="text-base font-bold text-gray-900 border-b pb-2">Logo & Branding</h2>
                <ImageUploadInput
                  label="Store Logo Image"
                  value={logoUrl}
                  onChange={(url, imageId) => {
                    setLogoUrl(url);
                    setLogoImageId(imageId);
                  }}
                  company={company}
                  assetType="logo"
                  source="logo"
                  placeholder="https://example.com/logo.png"
                  helpText="Upload a store logo file or paste image URL"
                />
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Header Title text</label>
                  <input
                    type="text"
                    value={headerTitle}
                    onChange={(e) => setHeaderTitle(e.target.value)}
                    placeholder="e.g. DK Designs Official Store"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-xs focus:outline-none"
                  />
                </div>
              </div>

              {/* Palette & Typography */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-4">
                <h2 className="text-base font-bold text-gray-900 border-b pb-2">Palette & Typography</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Primary Color</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-9 w-12 rounded border cursor-pointer"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Secondary / Accent Color</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-9 w-12 rounded border cursor-pointer"
                      />
                      <input
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Font Family</label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="Inter">Inter (Sleek/Modern)</option>
                    <option value="Roboto">Roboto (Clean/Professional)</option>
                    <option value="Outfit">Outfit (Geometric/Futuristic)</option>
                    <option value="serif">Georgia (Classic Serif)</option>
                  </select>
                </div>
              </div>

              {/* Social Channels */}
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs space-y-4">
                <h2 className="text-base font-bold text-gray-900 border-b pb-2">Social Channels</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Facebook URL</label>
                    <input
                      type="text"
                      value={socialFacebook}
                      onChange={(e) => setSocialFacebook(e.target.value)}
                      placeholder="https://facebook.com/mycompany"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Instagram URL</label>
                    <input
                      type="text"
                      value={socialInstagram}
                      onChange={(e) => setSocialInstagram(e.target.value)}
                      placeholder="https://instagram.com/mycompany"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">WhatsApp Number</label>
                    <input
                      type="text"
                      value={socialWhatsapp}
                      onChange={(e) => setSocialWhatsapp(e.target.value)}
                      placeholder="e.g. +919999999999"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Rendered Storefront Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
            {/* Viewport Frame Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Live Storefront Dynamic Preview</h2>
                <p className="text-xs text-gray-500">
                  Real-time render of your customized navigation & homepage sections.
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewportMode("desktop")}
                  className={`rounded-md px-3 py-1.5 transition-colors cursor-pointer ${
                    viewportMode === "desktop"
                      ? "bg-white text-gray-900 shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode("mobile")}
                  className={`rounded-md px-3 py-1.5 transition-colors cursor-pointer ${
                    viewportMode === "mobile"
                      ? "bg-white text-gray-900 shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Mobile
                </button>
              </div>
            </div>

            {/* Live Preview Container */}
            <div className="bg-gray-100 p-3 sm:p-4 rounded-xl overflow-hidden min-h-[500px]">
              <div
                className={`transition-all duration-300 bg-white shadow-lg overflow-y-auto max-h-[750px] ${
                  viewportMode === "mobile"
                    ? "w-[375px] mx-auto rounded-2xl border-4 border-gray-800"
                    : "w-full rounded-xl border border-gray-200"
                }`}
                style={{ fontFamily: getFontFamilyCss(fontFamily) }}
              >
                {/* Storefront Header */}
                <StorefrontHeader
                  theme={liveStorefrontTheme}
                  company={company}
                  categories={workspaceCategories.length > 0 ? workspaceCategories : mockCategories}
                />

                {/* Homepage Sections */}
                {homeSections
                  .filter((s) => s.enabled)
                  .sort((a, b) => a.order - b.order)
                  .map((section) => (
                    <HomeSectionRenderer
                      key={section.id}
                      section={section}
                      theme={liveStorefrontTheme}
                      categories={workspaceCategories.length > 0 ? workspaceCategories : mockCategories}
                      colors={workspaceColors}
                      materials={workspaceMaterials}
                      products={workspaceProducts.length > 0 ? workspaceProducts : mockProducts}
                      offers={workspaceOffers}
                      imagesById={imagesById}
                      isPreview={true}
                    />
                  ))}

                {/* Storefront Footer */}
                <StorefrontFooter theme={liveStorefrontTheme} settings={mockFooterSettings} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Variant Lookup Modal for Carousel */}
      <ProductLookupModal
        open={isVariantModalOpen}
        onClose={() => setIsVariantModalOpen(false)}
        onAddSelected={handleSaveVariantSelection}
        title={`Select Carousel Product Variants (Max: ${modalMaxLimit})`}
        maxSelection={modalMaxLimit}
        items={productLookup.items}
        loading={productLookup.loading}
        filters={productLookup.filters}
        onFiltersChange={productLookup.setFilters}
        categoryOptions={productLookup.categoryOptions}
        page={productLookup.page}
        totalPages={productLookup.totalPages}
        itemsPerPage={productLookup.itemsPerPage}
        totalCount={productLookup.totalCount}
        onPageChange={productLookup.setPage}
        isSelected={(item) => tempSelectedVariantIds.includes(Number(item.variant_id))}
        onToggle={handleToggleVariantSelection}
        onToggleAll={handleToggleAllVariants}
        selectedCount={tempSelectedVariantIds.length}
      />
    </div>
  );
}
