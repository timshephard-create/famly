import type { Metadata, Viewport } from 'next';
import { DM_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';
import Nav from '@/components/Nav';
import SupportWidget from '@/components/SupportWidget';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Kindora · Decisions, not decision fatigue.',
    template: '%s · Kindora',
  },
  description:
    "Childcare, health insurance, kids' media, meal planning — four decisions, not decision fatigue. Kindora navigates the broken systems so families don't have to.",
  metadataBase: new URL('https://kindora.world'),
  openGraph: {
    title: 'Kindora · Decisions, not decision fatigue.',
    description:
      "Childcare, health insurance, kids' media, meal planning — four decisions, not decision fatigue. Kindora navigates the broken systems so families don't have to.",
    url: 'https://kindora.world',
    siteName: 'Kindora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kindora · Decisions, not decision fatigue.',
    description:
      "Childcare, health insurance, kids' media, meal planning — four decisions, not decision fatigue. Kindora navigates the broken systems so families don't have to.",
  },
};

export const viewport: Viewport = {
  themeColor: '#0E6B43',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${inter.variable} ${jetbrains.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="font-sans antialiased">
        <Nav />
        <main>{children}</main>
        <footer className="border-t border-border px-5 py-6">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-xs text-fg-muted">
              &copy; 2026 Creative Mind Ventures LLC
            </p>
            <div className="flex gap-4">
              <a href="/privacy" data-testid="footer-privacy-link" className="text-xs text-fg-muted transition-colors hover:text-fg">Privacy Policy</a>
              <a href="/terms" data-testid="footer-terms-link" className="text-xs text-fg-muted transition-colors hover:text-fg">Terms of Service</a>
            </div>
          </div>
        </footer>
        <SupportWidget />
        <Analytics />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-MSYQHTF19P" strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-MSYQHTF19P');
        `}</Script>
        <Script id="clarity-init" strategy="afterInteractive">{`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "w9txjiqz27");
        `}</Script>
      </body>
    </html>
  );
}
