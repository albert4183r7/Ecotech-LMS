"use client";

import { useState } from "react";
import { Eye, EyeOff, Mail, Lock, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useUserStore } from "@/stores/lms-store";
import { useNavigation } from "@/hooks/use-navigation";

export function AuthPage() {
  const { login } = useUserStore();
  const { navigateTo } = useNavigation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Login failed");
        return;
      }
      login(json.data.id, json.data.role);
      navigateTo("home");
      toast.success("Welcome back, " + (json.data.name || json.data.email) + "!");
    } catch {
      toast.error("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: demoEmail, password: demoPassword }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Login failed");
        return;
      }
      login(json.data.id, json.data.role);
      navigateTo("home");
      toast.success("Welcome back, " + (json.data.name || json.data.email) + "!");
    } catch {
      toast.error("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-600 to-teal-500 shadow-lg shadow-cyan-500/20">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-foreground text-2xl font-bold">Welcome to Ecotech</h1>
          <p className="text-muted-foreground mt-2 text-sm">Sign in to continue learning</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                id="email"
                type="email"
                placeholder="you@ecotech.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                autoComplete="email"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10 pl-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
        </form>

        <div className="space-y-3">
          <p className="text-muted-foreground text-center text-xs font-semibold tracking-wider uppercase">
            Demo Accounts (Click to Sign In)
          </p>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => handleDemoLogin("alex.student@ecotech.com", "student123")}
              disabled={loading}
              className="border-border/50 bg-card flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-cyan-500/30 hover:bg-cyan-500/5 disabled:opacity-50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <span className="text-xs font-bold">S</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Student</p>
                <p className="text-muted-foreground truncate text-xs">alex.student@ecotech.com</p>
              </div>
              <span className="text-muted-foreground text-[10px] font-medium">student</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin("instructor@ecotech.com", "instructor123")}
              disabled={loading}
              className="border-border/50 bg-card flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-violet-500/30 hover:bg-violet-500/5 disabled:opacity-50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                <span className="text-xs font-bold">I</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Instructor</p>
                <p className="text-muted-foreground truncate text-xs">instructor@ecotech.com</p>
              </div>
              <span className="text-muted-foreground text-[10px] font-medium">instructor</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
