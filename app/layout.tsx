import type { Metadata } from "next";
import "./globals.css";
import { AuthReturnRouter } from "@/components/auth/return-router";
export const metadata: Metadata = {
  title: "ClearPath Review",
  description:
    "A clear path from first draft to human approval. Fictional marketing review workspace.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthReturnRouter />
        {children}
      </body>
    </html>
  );
}
