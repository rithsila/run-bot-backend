# Component Templates

## Client Component Template

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface MyComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export function MyComponent({ className, children }: MyComponentProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn("", className)}>
      {children}
    </div>
  );
}
```

## Form Component Template

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

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email"),
});

type FormValues = z.infer<typeof formSchema>;

interface MyFormProps {
  onSuccess?: () => void;
}

export function MyForm({ onSuccess }: MyFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      // API call here
      toast.success("Success!");
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="your@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Submitting..." : "Submit"}
        </Button>
      </form>
    </Form>
  );
}
```

## Dialog Component Template

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface MyDialogProps {
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function MyDialog({ trigger, onSuccess }: MyDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button>Open Dialog</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
        </DialogHeader>
        {/* Content */}
      </DialogContent>
    </Dialog>
  );
}
```

## Card Component Template

```tsx
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MyCardProps {
  title: string;
  className?: string;
  children?: React.ReactNode;
}

export function MyCard({ title, className, children }: MyCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
```

## Panel Component (Dashboard) Template

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFeature } from "@/lib/hooks/useFeature";
import { MembershipStatus } from "@/lib/hooks/useMe";

interface MyPanelProps {
  membership?: MembershipStatus;
}

export function MyPanel({ membership }: MyPanelProps) {
  const { data, isLoading } = useFeature();
  const [open, setOpen] = useState(false);
  const isMember = membership === MembershipStatus.MEMBER;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse h-20 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Panel Title</CardTitle>
      </CardHeader>
      <CardContent>
        {isMember ? (
          <div>Member content</div>
        ) : (
          <div className="text-muted-foreground">
            Join to access this feature
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

## Tab Navigation Template

```tsx
"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Home", value: "home", icon: Home },
  { label: "Profile", value: "profile", icon: User },
  { label: "Settings", value: "settings", icon: Settings },
] as const;

export function TabNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = useMemo(() => {
    const segments = pathname?.split("/").filter(Boolean) ?? [];
    const last = segments[segments.length - 1];
    return tabs.some((t) => t.value === last) ? last : "home";
  }, [pathname]);

  return (
    <div className="flex items-center gap-1 overflow-x-auto bg-card p-1.5">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => router.push(`/${tab.value}`)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
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
