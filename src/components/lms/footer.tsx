"use client";

import { BookOpen, Heart, ExternalLink } from "lucide-react";

/** Footer link configuration */
interface FooterLink {
  label: string;
  onClick?: () => void;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

/** Sticky footer component for the LMS application */
export function Footer() {
  const sections: FooterSection[] = [
    {
      title: "Platform",
      links: [
        { label: "Browse Courses" },
        { label: "My Learning" },
        { label: "Create Course" },
        { label: "Leaderboard" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Help Center" },
        { label: "Documentation" },
        { label: "API Reference" },
        { label: "Changelog" },
      ],
    },
    {
      title: "Company",
      links: [{ label: "About" }, { label: "Blog" }, { label: "Careers" }, { label: "Contact" }],
    },
  ];

  return (
    <footer className="border-border/60 from-card to-muted/30 glass-card card-glass-strong particle-shimmer-slow mt-auto border-t bg-gradient-to-b">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        {/* Main Footer Content */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {/* Brand Column */}
          <div className="col-span-2 sm:col-span-1">
            <div className="mb-4 flex items-center gap-2.5">
              <img
                src="/ecotech-logo.png"
                alt="Ecotech"
                className="h-9 w-9 rounded-md object-contain"
              />
              <img src="/ecotech-name.png" alt="Ecotech" className="h-6 w-auto object-contain" />
            </div>
            <p className="text-muted-foreground max-w-[220px] text-sm leading-relaxed">
              Empowering teams through knowledge sharing. Built for organizations that invest in
              their people.
            </p>
            <div className="text-muted-foreground mt-4 flex items-center gap-1.5 text-xs">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              All systems operational
            </div>
          </div>

          {/* Link Columns */}
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-foreground mb-3 text-sm font-semibold">{section.title}</h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <button
                      type="button"
                      className="btn-ripple group text-muted-foreground hover:text-primary hover-lift flex items-center gap-1 text-sm transition-colors"
                    >
                      {link.label}
                      <ExternalLink className="h-3 w-3 -translate-y-px opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-40" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="border-border/40 mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row">
          {/* Copyright + Tech */}
          <div className="text-muted-foreground/70 flex items-center gap-3 text-xs">
            <span>&copy; {new Date().getFullYear()} Ecotech</span>
            <span className="text-border hidden sm:inline">·</span>
            <span className="hidden sm:inline">Built for teams that learn together</span>
          </div>

          {/* Status */}
          <div className="text-muted-foreground/60 flex items-center gap-4 text-xs">
            <span className="hidden items-center gap-1 sm:inline-flex">
              <BookOpen className="h-3 w-3" />
              v1.0.0
            </span>
            <span className="inline-flex items-center gap-1">
              Made with <Heart className="h-3 w-3 fill-red-400 text-red-400" /> by the Ecotech Team
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
