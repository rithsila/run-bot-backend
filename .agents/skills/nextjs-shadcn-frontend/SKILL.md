---
name: nextjs-shadcn-frontend
description: Build Next.js 16 frontend applications with Tailwind CSS v4, shadcn/ui, TanStack Query, and React Hook Form. Use when creating React components, forms, dashboard layouts, authentication flows, API integrations, or any frontend development for the BHub trading platform.
---

# Next.js 16 + shadcn/ui Frontend Development

## Tech Stack Overview

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js | 16.x |
| React | React | 19.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui | - |
| UI Primitives | Radix UI | 1.x |
| State Management | TanStack Query | 5.x |
| Forms | React Hook Form + Zod | 7.x + 4.x |
| Icons | Lucide React | latest |
| Notifications | Sonner | 2.x |

## Project Structure

```
app/                           # Next.js App Router
├── (auth)/                    # Route group: Auth pages (no layout wrapper)
│   ├── forgot-password/
│   ├── register/
│   ├── reset-password/
│   └── verify-email/
│
├── (protected)/               # Route group: Authenticated pages
│   ├── layout.tsx             # Protected layout with auth check
│   ├── protected-layout-client.tsx
│   └── [feature]/page.tsx     # Feature pages
│
├── api/                       # API Routes
│   ├── auth/[action]/         # Authentication endpoints
│   ├── backend/[...path]/     # Backend proxy (catch-all)
│   └── [endpoint]/route.ts    # Other API routes
│
├── layout.tsx                 # Root layout
├── page.tsx                   # Default route (login)
├── providers.tsx              # React Query provider
└── globals.css                # Global styles + Tailwind v4

components/
├── auth/                      # Authentication components
├── dashboard/                 # Dashboard feature components
├── ui/                        # shadcn/ui components (auto-generated)
└── [Component].tsx            # Shared components

lib/
├── hooks/                     # TanStack Query hooks (useX.ts)
├── authClient.ts             # Client-side auth utilities
├── clientApi.ts              # API client with auto session refresh
└── utils.ts                  # cn() utility for Tailwind classes
```

## Import Order Convention

Always organize imports in this exact order:

```tsx
// 1. React/Next imports
import { useState } from "react";
import { useRouter } from "next/navigation";

// 2. Third-party libraries
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

// 3. UI components
import { Button } from "@/components/ui/button";

// 4. Custom hooks and utilities
import { useMe } from "@/lib/hooks/useMe";
import { clientApiJson } from "@/lib/clientApi";

// 5. Types
import type { MyType } from "@/lib/types";
```

## Tailwind CSS v4 Configuration

This project uses **Tailwind CSS v4** with CSS-first configuration in `globals.css`:

```css
@import "tailwindcss";

/* Theme variables for semantic colors */
@theme {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-destructive: hsl(var(--destructive));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
}

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --primary: 229 84% 55%;        /* Blue theme */
    --primary-foreground: 0 0% 100%;
    --border: 0 0% 89.8%;
    --ring: 229 84% 55%;
    --radius: 0.5rem;
  }
}
```

### cn() Utility

Always use the `cn()` utility for conditional class merging:

```tsx
import { cn } from "@/lib/utils";

className={cn("base-class", isActive && "active-class", className)}
```

## Component Patterns

### 1. Client Components

Always mark client components with `"use client"`:

```tsx
"use client";

import { useState } from "react";

export function MyComponent() {
  const [state, setState] = useState(false);
  // ...
}
```

### 2. UI Components with CVA

UI components use `class-variance-authority` for variants:

```tsx
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "base-classes",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-white",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
      },
    },
  }
);
```

### 3. Dashboard Tabs Pattern

For dashboard navigation with tabs:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { label: "Home", value: "home", icon: Home },
  { label: "Robots", value: "robots", icon: Bot },
] as const;

export function DashboardTabs() {
  const router = useRouter();
  const pathname = usePathname();
  
  const activeValue = useMemo(() => {
    const segments = pathname?.split("/").filter(Boolean) ?? [];
    const last = segments[segments.length - 1];
    return tabs.some((t) => t.value === last) ? last : "home";
  }, [pathname]);

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeValue === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => router.push(`/${tab.value}`)}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

## Form Handling Pattern

Forms use React Hook Form + Zod validation:

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export function MyForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await submitData(values);
      toast.success("Success!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="your@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Submit
        </Button>
      </form>
    </Form>
  );
}
```

## Data Fetching with TanStack Query

### API Client Pattern

```tsx
// lib/clientApi.ts
export async function clientApiJson<T>(path: string, init: RequestInit = {}) {
  const perform = () =>
    fetch(`/api/backend${path}`, {
      ...init,
      credentials: "include",
      headers: buildHeaders(init.headers),
    });

  let res = await perform();
  if (res.status === 401) {
    const ok = await refreshSession();
    if (ok) res = await perform();
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const error = new Error(data?.error?.message ?? "Request failed") as Error & {
      status?: number;
      retryAfter?: number;
    };
    error.status = res.status;
    if (res.status === 429) {
      error.retryAfter = parseRetryDelaySeconds(res.headers);
    }
    throw error;
  }

  return data as T;
}
```

### Custom Hook Pattern

```tsx
// lib/hooks/useFeature.ts
import { useQuery } from "@tanstack/react-query";
import { clientApiJson } from "@/lib/clientApi";

export type FeatureData = {
  id: string;
  name: string;
};

export function useFeature() {
  return useQuery<FeatureData>({
    queryKey: ["feature"],
    queryFn: () => clientApiJson("/feature"),
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
```

### Error Handling with Rate Limiting

```tsx
try {
  await apiCall();
} catch (error) {
  if (error.status === 429 && error.retryAfter) {
    toast.error(`Please try again in ${error.retryAfter} seconds`);
  } else {
    toast.error(error.message || "Something went wrong");
  }
}
```

## Dialog Component Pattern

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MyDialog({ open, onOpenChange }: MyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
        </DialogHeader>
        {/* Dialog content */}
      </DialogContent>
    </Dialog>
  );
}
```

## Authentication Flow

### Protected Layout Pattern

```tsx
// (protected)/protected-layout-client.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe } from "@/lib/authClient";

export default function ProtectedLayoutClient({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const nextUrl = `${window.location.pathname}${window.location.search}`;
    const goLogin = () => router.replace(`/?next=${encodeURIComponent(nextUrl)}`);

    (async () => {
      try {
        await fetchMe();
      } catch {
        goLogin();
        return;
      }
      setOk(true);
    })();
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}
```

### Login Form Pattern

```tsx
async function handleLogin(values: LoginFormValues) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(json?.error?.message || "Login failed");
  }

  // Update TanStack Query cache
  queryClient.setQueryData(["me"], {
    success: true,
    data: { user: json.data.user, membership: json.data.membership },
  });

  toast.success("Logged in successfully");
  router.push(nextPath);
  router.refresh();
}
```

## Backend Proxy Architecture

All backend API calls go through `/api/backend/[...path]/route.ts`:

```tsx
// app/api/backend/[...path]/route.ts
import { NextRequest } from "next/server";
import { forward } from "../../proxy";

function resolveBackendPath(path?: string[]) {
  const joined = (path ?? []).join("/");
  return joined ? `/${joined}` : "/";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params;
  return forward(req, resolveBackendPath(path));
}

// Same pattern for POST, PUT, PATCH, DELETE
```

## Styling Conventions

### Common Class Patterns

```tsx
// Cards
<div className="rounded-2xl border border-border bg-card p-8 shadow-sm">

// Form inputs with icons
<div className="relative">
  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/60" />
  <Input
    className="h-12 rounded-xl border-border bg-muted/30 pl-10"
    {...field}
  />
</div>

// Error states
<div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">

// Buttons
<Button className="h-12 w-full rounded-xl text-base font-semibold">

// Loading states
<Button disabled={isLoading}>
  {isLoading ? "Loading..." : "Submit"}
</Button>
```

## Adding shadcn/ui Components

```bash
npx shadcn add button
npx shadcn add dialog
npx shadcn add form
npx shadcn add input
```

Available components: https://ui.shadcn.com/docs/components

## Environment Variables

Required in `.env.local`:

```bash
BACKEND_URL=http://localhost:3001  # Backend API base URL
```

## Common Patterns Summary

| Task | Pattern |
|------|---------|
| New dashboard tab | Add to `DashboardTabs.tsx` + create page at `app/(protected)/[tab]/page.tsx` |
| New API hook | Create `lib/hooks/useX.ts` using `useQuery` + `clientApiJson()` |
| New API route | Create at `app/api/[route]/route.ts`, use `forward()` for backend proxy |
| Form validation | Zod schema + `react-hook-form` with `zodResolver` |
| Error handling | Sonner `toast.error()` with user-friendly messages |
| Loading states | `isLoading` / `isPending` from TanStack Query |
| Icons | Use `lucide-react` imports |
