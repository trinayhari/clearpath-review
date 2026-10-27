import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    if (["/", "/account"].includes(request.nextUrl.pathname))
      return NextResponse.redirect(
        new URL("/login?setup=required", request.url),
      );
    return response;
  }
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items)
          response.cookies.set(name, value, options);
      },
    },
  });
  // Validated identity, never trust getSession() as authorization.
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  let redirectTo: string | undefined;
  if (["/", "/account"].includes(request.nextUrl.pathname) && (!user || error))
    redirectTo = "/login";
  if (request.nextUrl.pathname === "/login" && user && !error) redirectTo = "/";
  if (redirectTo) {
    const redirect = NextResponse.redirect(new URL(redirectTo, request.url));
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    response = redirect;
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
export const config = { matcher: ["/", "/login", "/account"] };
