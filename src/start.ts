import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const req = getRequest();
    if (req?.url && new URL(req.url).pathname.startsWith("/lovable/")) {
      return await next();
    }
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // Let server-function errors propagate so TanStack frames them as a
    // proper TSR error envelope. Otherwise auth/validation throws become a
    // 500 HTML page on /_serverFn/* routes, which breaks the client and
    // blanks the screen.
    try {
      const req = getRequest();
      if (req?.url && new URL(req.url).pathname.startsWith("/_serverFn/")) {
        throw error;
      }
    } catch (e) {
      if (e === error) throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
