"use client";

import { GraduationCap, BookOpen, Heart, ExternalLink } from "lucide-react";

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
      links: [
        { label: "About" },
        { label: "Blog" },
        { label: "Careers" },
        { label: "Contact" },
      ],
    },
  ];

  return (
    <footer className="mt-auto border-t border-border/60 bg-gradient-to-b from-card to-muted/30 glass-card">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        {/* Main Footer Content */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {/* Brand Column */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm">
                <GraduationCap className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold tracking-tight gradient-text">
                OpenClass
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground max-w-[220px]">
              Empowering teams through knowledge sharing. Built for organizations that invest in their people.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              All systems operational
            </div>
          </div>

          {/* Link Columns */}
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {section.title}
              </h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <button
                      type="button"
                      className="btn-ripple group flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary hover-lift"
                    >
                      {link.label}
                      <ExternalLink className="h-3 w-3 opacity-0 -translate-y-px transition-all group-hover:opacity-40 group-hover:translate-y-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/40 pt-6 sm:flex-row">
          {/* Copyright + Tech */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
            <span>&copy; {new Date().getFullYear()} OpenClass</span>
            <span className="hidden sm:inline text-border">·</span>
            <span className="hidden sm:inline">Built for teams that learn together</span>
          </div>

          {/* Status */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
            <span className="hidden sm:inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              v1.0.0
            </span>
            <span className="inline-flex items-center gap-1">
              Made with <Heart className="h-3 w-3 fill-red-400 text-red-400" /> by the OpenClass Team
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
