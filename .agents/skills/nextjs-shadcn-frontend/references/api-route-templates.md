# API Route Templates

## Backend Proxy Route

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

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params;
  return forward(req, resolveBackendPath(path));
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params;
  return forward(req, resolveBackendPath(path));
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params;
  return forward(req, resolveBackendPath(path));
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params;
  return forward(req, resolveBackendPath(path));
}
```

## Proxy Utility

```tsx
// app/api/proxy.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL!;

export async function forward(req: NextRequest, path: string) {
  const url = new URL(path, BACKEND_URL);
  
  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers = new Headers(req.headers);
  headers.set("x-request-id", crypto.randomUUID());
  
  const response = await fetch(url, {
    method: req.method,
    headers,
    body: req.body,
    // @ts-ignore - duplex is required for streaming
    duplex: "half",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
```

## Auth API Route (Login)

```tsx
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { forward } from "../../proxy";

export async function POST(req: NextRequest) {
  return forward(req, "/auth/login");
}
```

## GET API Route

```tsx
// app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { forward } from "../proxy";

export async function GET(req: NextRequest) {
  return forward(req, "/me");
}
```

## Custom API Route with Error Handling

```tsx
// app/api/custom/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Your logic here
    const data = { message: "Success" };
    
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("API Error:", error);
    
    return NextResponse.json(
      { success: false, error: { message: "Internal server error" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate and process
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: { message: "Name is required" } },
        { status: 400 }
      );
    }
    
    return NextResponse.json({ success: true, data: body });
  } catch (error) {
    console.error("API Error:", error);
    
    return NextResponse.json(
      { success: false, error: { message: "Internal server error" } },
      { status: 500 }
    );
  }
}
```
