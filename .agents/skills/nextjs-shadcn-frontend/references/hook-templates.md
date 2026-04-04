# Hook Templates

## Basic TanStack Query Hook

```tsx
// lib/hooks/useFeature.ts
import { useQuery } from "@tanstack/react-query";
import { clientApiJson } from "@/lib/clientApi";

export type FeatureData = {
  id: string;
  name: string;
  status: string;
};

export type FeatureResponse = {
  success?: boolean;
  data?: FeatureData;
};

export function useFeature() {
  return useQuery<FeatureResponse>({
    queryKey: ["feature"],
    queryFn: () => clientApiJson("/feature"),
    staleTime: 15 * 60_000,      // 15 minutes
    gcTime: 30 * 60_000,         // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
```

## Hook with Parameter

```tsx
// lib/hooks/useUserById.ts
import { useQuery } from "@tanstack/react-query";
import { clientApiJson } from "@/lib/clientApi";

export type User = {
  id: string;
  fullName: string;
  email: string;
};

export function useUserById(userId: string) {
  return useQuery<User>({
    queryKey: ["user", userId],
    queryFn: () => clientApiJson(`/users/${userId}`),
    enabled: !!userId,  // Only run if userId exists
    staleTime: 5 * 60_000,
    retry: false,
  });
}
```

## Mutation Hook

```tsx
// lib/hooks/useCreateItem.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiJson } from "@/lib/clientApi";
import { toast } from "sonner";

export type CreateItemInput = {
  name: string;
  description: string;
};

export type CreateItemResponse = {
  id: string;
  name: string;
};

export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateItemInput) => {
      return clientApiJson<CreateItemResponse>("/items", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast.success("Item created successfully");
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create item");
    },
  });
}
```

## Paginated Query Hook

```tsx
// lib/hooks/useItems.ts
import { useQuery } from "@tanstack/react-query";
import { clientApiJson } from "@/lib/clientApi";

export type PaginatedItems = {
  items: Array<{ id: string; name: string }>;
  total: number;
  page: number;
  pageSize: number;
};

export function useItems(page: number = 1, pageSize: number = 10) {
  return useQuery<PaginatedItems>({
    queryKey: ["items", page, pageSize],
    queryFn: () =>
      clientApiJson(`/items?page=${page}&pageSize=${pageSize}`),
    placeholderData: (previousData) => previousData,
  });
}
```

## Auth Client Pattern

```tsx
// lib/authClient.ts
import { clientApiJson } from "./clientApi";

export type User = {
  id: string;
  fullName?: string;
  email?: string;
};

export type MeData = {
  user?: User;
  membership?: string;
};

export type MeResponse = {
  success?: boolean;
  data?: MeData;
};

export async function fetchMe(): Promise<MeResponse> {
  return clientApiJson("/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}
```

## useMe Hook (Standard)

```tsx
// lib/hooks/useMe.ts
import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "@/lib/authClient";

export enum MembershipStatus {
  NOT_JOINED = "NOT_JOINED",
  NOT_MEMBER = "NOT_MEMBER",
  MEMBER = "MEMBER",
}

export type MeUser = {
  fullName?: string;
  username?: string;
  email?: string;
};

export type MeData = {
  membership?: MembershipStatus;
  user?: MeUser;
};

export type MeResponse = {
  success?: boolean;
  data?: MeData;
};

export function useMe() {
  const query = useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  return { ...query, isLoading: query.isPending };
}
```

## Custom Local State Hook

```tsx
// lib/hooks/useToggle.ts
import { useState, useCallback } from "react";

export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  
  const toggle = useCallback(() => setValue((v) => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);
  
  return { value, toggle, setTrue, setFalse, setValue };
}
```

## useCopyToClipboard Hook

```tsx
// lib/hooks/useCopyToClipboard.ts
import { useState, useCallback } from "react";
import { toast } from "sonner";

export function useCopyToClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    async (text: string, message?: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (message) toast.success(message);
        setTimeout(() => setCopied(false), timeout);
        return true;
      } catch {
        toast.error("Failed to copy to clipboard");
        return false;
      }
    },
    [timeout]
  );

  return { copied, copy };
}
```
