import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function AuthTopBar() {
  return (
    <nav className="absolute top-0 inset-x-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="font-extrabold text-xl tracking-tighter uppercase">
          Noor<span className="text-primary">Pay</span>
        </Link>
        <Link
          to="/"
          className="text-sm font-medium px-4 py-2 hover:bg-muted rounded-full transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="size-4" /> На главную
        </Link>
      </div>
    </nav>
  );
}