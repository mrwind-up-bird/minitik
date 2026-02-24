import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Minitik",
    short_name: "Minitik",
    description:
      "Schedule and publish short-form videos to TikTok, Instagram, and YouTube from one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#ff0050",
    orientation: "portrait-primary",
    scope: "/",
    categories: ["social", "productivity"],
    icons: [
      {
        src: "/icons/icon-72.png",
        sizes: "72x72",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-96.png",
        sizes: "96x96",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-128.png",
        sizes: "128x128",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-144.png",
        sizes: "144x144",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-152.png",
        sizes: "152x152",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-384.png",
        sizes: "384x384",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/home.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Home — content library",
      },
      {
        src: "/screenshots/upload.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Upload a video",
      },
    ],
    shortcuts: [
      {
        name: "Upload Video",
        short_name: "Upload",
        description: "Upload a new video to schedule",
        url: "/upload",
        icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }],
      },
      {
        name: "Content Library",
        short_name: "Library",
        description: "Browse your content",
        url: "/content",
        icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }],
      },
      {
        name: "Analytics",
        short_name: "Analytics",
        description: "View performance analytics",
        url: "/analytics",
        icons: [{ src: "/icons/icon-96.png", sizes: "96x96" }],
      },
    ],
    prefer_related_applications: false,
    related_applications: [],
  };
}
