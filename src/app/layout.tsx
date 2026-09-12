import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { SITE_URL } from "@/lib/wagmi";

const description =
  "Decentralized exchange for tokenized equities on Robinhood Chain. Instant settlement, markets that never close, and every trading fee paid to $DIVS stakers.";

/**
 * `metadataBase` is what Next resolves relative asset paths against, so without
 * it a link posted anywhere off-site asks for the image on that site rather
 * than on this one, and the preview comes back blank.
 *
 * The card is its own asset. The in-app logo is a single-colour cutout on
 * transparency, which works on this dark UI but loses its two bars against the
 * white a preview card is drawn on.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "DIVS Protocol",
  description,
  openGraph: {
    title: "DIVS Protocol",
    description,
    url: SITE_URL,
    siteName: "DIVS Protocol",
    images: ["/logo-card.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DIVS Protocol",
    description,
    images: ["/logo-card.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
