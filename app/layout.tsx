import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام حوكمة الصرف والتحويلات – TITO",
  description: "نظام TITO لإدارة طلبات الصرف والاعتمادات والمسيرات والتنفيذ.",
  metadataBase: new URL("https://tito-expense-governance.q5g62m7ztb.chatgpt.site"),
  openGraph: {
    title: "نظام حوكمة الصرف والتحويلات – TITO",
    description: "اعتماد، تدقيق وتنفيذ المصروفات بمسار واضح وآمن.",
    url: "/",
    siteName: "TITO",
    locale: "ar_SA",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "نظام حوكمة الصرف والتحويلات – TITO" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "نظام حوكمة الصرف والتحويلات – TITO",
    description: "اعتماد، تدقيق وتنفيذ المصروفات بمسار واضح وآمن.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
