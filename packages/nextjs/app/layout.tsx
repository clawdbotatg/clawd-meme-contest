import "@rainbow-me/rainbowkit/styles.css";
import "@scaffold-ui/components/styles.css";
import { ClientProviders } from "~~/components/ClientProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "🦞 CLAWD MEME ARENA",
  description: "The dankest meme contest on Base. Submit memes, vote with $CLAWD, win prizes. 10% of all fees burned 🔥",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className="" data-theme="dark">
      <body className="bg-black">
        <ThemeProvider enableSystem={false} defaultTheme="dark" forcedTheme="dark">
          <ClientProviders>{children}</ClientProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
