import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

const criticalFallbackCss = `
:root{--background:#fbfbfb;--foreground:#17352d;--card:#fff;--primary:#1e5f4e;--primary-foreground:#f8fffc;--muted:#f1f5f3;--muted-foreground:#65746f;--border:#dfe7e3;--input:#d8e2de}*{box-sizing:border-box}html{background:var(--background);color:var(--foreground);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;background:var(--background);color:var(--foreground);-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}button,input{font:inherit}.min-h-screen{min-height:100vh}.bg-background{background:var(--background)}.bg-card{background:var(--card)}.bg-primary{background:var(--primary)}.bg-muted{background:var(--muted)}.text-foreground{color:var(--foreground)}.text-primary{color:var(--primary)}.text-primary-foreground{color:var(--primary-foreground)}.text-muted-foreground{color:var(--muted-foreground)}.border-border{border-color:var(--border)}.border-input{border-color:var(--input)}.border,.border-t,.border-b,.border-y{border-style:solid;border-width:0}.border{border-width:1px}.border-t{border-top-width:1px}.border-b{border-bottom-width:1px}.border-y{border-top-width:1px;border-bottom-width:1px}.sticky{position:sticky}.relative{position:relative}.top-0{top:0}.z-50{z-index:50}.mx-auto{margin-left:auto;margin-right:auto}.mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mt-3{margin-top:.75rem}.mt-6{margin-top:1.5rem}.mt-8{margin-top:2rem}.mb-1{margin-bottom:.25rem}.mb-2{margin-bottom:.5rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}.mb-8{margin-bottom:2rem}.block{display:block}.inline-flex{display:inline-flex}.flex{display:flex}.grid{display:grid}.hidden{display:none}.h-16{height:4rem}.h-auto{height:auto}.w-full{width:100%}.max-w-md{max-width:28rem}.max-w-7xl{max-width:80rem}.max-w-4xl{max-width:56rem}.max-w-2xl{max-width:42rem}.min-w-0{min-width:0}.items-center{align-items:center}.items-start{align-items:flex-start}.items-baseline{align-items:baseline}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.gap-1\.5{gap:.375rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.gap-6{gap:1.5rem}.gap-8{gap:2rem}.gap-10{gap:2.5rem}.space-y-3>:not([hidden])~:not([hidden]){margin-top:.75rem}.space-y-4>:not([hidden])~:not([hidden]){margin-top:1rem}.space-y-6>:not([hidden])~:not([hidden]){margin-top:1.5rem}.space-y-7>:not([hidden])~:not([hidden]){margin-top:1.75rem}.px-4{padding-left:1rem;padding-right:1rem}.px-5{padding-left:1.25rem;padding-right:1.25rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-6{padding-top:1.5rem;padding-bottom:1.5rem}.py-12{padding-top:3rem;padding-bottom:3rem}.py-20{padding-top:5rem;padding-bottom:5rem}.p-3{padding:.75rem}.p-6{padding:1.5rem}.pt-6{padding-top:1.5rem}.pt-8{padding-top:2rem}.pt-16{padding-top:4rem}.pb-24{padding-bottom:6rem}.text-center{text-align:center}.text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-base{font-size:1rem;line-height:1.5rem}.text-lg{font-size:1.125rem;line-height:1.75rem}.text-xl{font-size:1.25rem;line-height:1.75rem}.text-3xl{font-size:1.875rem;line-height:2.25rem}.text-4xl{font-size:2.25rem;line-height:2.5rem}.text-5xl{font-size:3rem;line-height:1}.text-7xl{font-size:4.5rem;line-height:1}.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.font-extrabold{font-weight:800}.uppercase{text-transform:uppercase}.tracking-tight{letter-spacing:0}.tracking-tighter{letter-spacing:0}.tracking-widest,.tracking-wider{letter-spacing:.08em}.leading-relaxed{line-height:1.625}.leading-\[1\.05\]{line-height:1.05}.opacity-60{opacity:.6}.rounded-md{border-radius:.375rem}.rounded-xl{border-radius:.75rem}.rounded-2xl{border-radius:1rem}.rounded-3xl{border-radius:1.5rem}.rounded-full{border-radius:9999px}.shadow-2xl{box-shadow:0 25px 50px -12px rgba(0,0,0,.12)}.ring-1{box-shadow:0 0 0 1px var(--border)}.size-1\.5{width:.375rem;height:.375rem}.size-12{width:3rem;height:3rem}.overflow-x-clip{overflow-x:clip}.backdrop-blur-md{backdrop-filter:blur(12px)}.bg-background\/80{background:rgba(251,251,251,.86)}.bg-primary\/5{background:rgba(30,95,78,.07)}.border-white\/10{border-color:rgba(255,255,255,.18)}.hover\:opacity-90:hover{opacity:.9}.hover\:bg-muted:hover{background:var(--muted)}.hover\:text-primary:hover{color:var(--primary)}.transition-colors,.transition-all{transition:all .18s ease}.girih-pattern{background-image:linear-gradient(30deg,rgba(30,95,78,.06) 12%,transparent 12.5%,transparent 87%,rgba(30,95,78,.06) 87.5%),linear-gradient(150deg,rgba(30,95,78,.06) 12%,transparent 12.5%,transparent 87%,rgba(30,95,78,.06) 87.5%);background-size:80px 140px}input{border:1px solid var(--input);border-radius:.75rem;background:var(--background);padding:.75rem 1rem;color:var(--foreground)}input[type=range]{width:100%;padding:0}.no-spinner::-webkit-outer-spin-button,.no-spinner::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.no-spinner{-moz-appearance:textfield}@media (min-width:768px){.md\:flex{display:flex}.md\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.md\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.md\:flex-row{flex-direction:row}.md\:space-y-8>:not([hidden])~:not([hidden]){margin-top:2rem}.md\:p-8{padding:2rem}.md\:text-4xl{font-size:2.25rem;line-height:2.5rem}.md\:text-5xl{font-size:3rem;line-height:1}.md\:text-6xl{font-size:3.75rem;line-height:1}}@media (min-width:1024px){.lg\:grid-cols-12{grid-template-columns:repeat(12,minmax(0,1fr))}.lg\:col-span-5{grid-column:span 5/span 5}.lg\:col-span-7{grid-column:span 7/span 7}.lg\:gap-16{gap:4rem}}`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no",
      },
      { title: "NoorPay" },
      { name: "description", content: "NoorPay" },
      { property: "og:title", content: "NoorPay" },
      { property: "og:description", content: "NoorPay" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#ffffff" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "default",
      },
      { name: "apple-mobile-web-app-title", content: "NoorPay" },
      { name: "format-detection", content: "telephone=no" },
      { name: "twitter:title", content: "NoorPay" },
      { name: "twitter:description", content: "NoorPay" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6338f67b-fb61-479c-9be3-0006a17b6b69/id-preview-2687b0d6--7d5b19ed-8907-4cde-9825-df3a9ad75c20.lovable.app-1780500213560.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6338f67b-fb61-479c-9be3-0006a17b6b69/id-preview-2687b0d6--7d5b19ed-8907-4cde-9825-df3a9ad75c20.lovable.app-1780500213560.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      {
        rel: "icon",
        type: "image/png",
        href: "/icon-192.png",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalFallbackCss }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
