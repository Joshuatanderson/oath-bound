import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const notoSans = Noto_Sans({ variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: 'Oathbound', template: '%s | Oathbound' },
  description: 'Verified developers. Audited skills. Cryptographic proof.',
  metadataBase: new URL('https://www.oathbound.ai'),
  openGraph: { type: 'website', siteName: 'Oathbound', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${notoSans.variable}`}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SiteHeader />
        <div className="pt-14">{children}</div>
      </body>
    </html>
  );
}
