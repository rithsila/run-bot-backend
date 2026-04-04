# Page Templates

## Login Page (Public)

```tsx
// app/page.tsx
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";

async function checkAuth() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/me`,
      { cache: "no-store" }
    );
    if (res.ok) return true;
  } catch {
    // Not authenticated
  }
  return false;
}

export default async function LoginPage() {
  const isAuthenticated = await checkAuth();
  
  if (isAuthenticated) {
    redirect("/home");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <LoginForm />
    </div>
  );
}
```

## Protected Page (Dashboard)

```tsx
// app/(protected)/[feature]/page.tsx
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { FeaturePanel } from "@/components/dashboard/FeaturePanel";
import { DashboardNavbar } from "@/components/dashboard/DashboardNavbar";

export default async function FeaturePage() {
  return (
    <div className="min-h-screen bg-background">
      <DashboardNavbar />
      <main className="container mx-auto px-4 py-6">
        <DashboardTabs />
        <div className="mt-6">
          <FeaturePanel />
        </div>
      </main>
    </div>
  );
}
```

## Protected Layout

```tsx
// app/(protected)/layout.tsx
import ProtectedLayoutClient from "./protected-layout-client";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayoutClient>{children}</ProtectedLayoutClient>;
}
```

## Protected Layout Client

```tsx
// app/(protected)/protected-layout-client.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe } from "@/lib/authClient";

export default function ProtectedLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const nextUrl = `${window.location.pathname}${window.location.search}`;
    const goLogin = () => router.replace(`/?next=${encodeURIComponent(nextUrl)}`);

    (async () => {
      try {
        await fetchMe();
      } catch {
        goLogin();
        return;
      }

      if (!cancelled) setOk(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}
```

## Root Layout

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "App Title",
  description: "App description",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster richColors closeButton position="top-center" />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
```

## Providers Component

```tsx
// app/providers.tsx
"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```
