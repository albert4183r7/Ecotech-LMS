"use client";

import { Download, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CertificateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  courseName: string;
  completionDate: string;
}

function handleDownloadCertificate(
  userName: string,
  courseName: string,
  completionDate: string
) {
  const formattedDate = new Date(completionDate).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );

  const border = "=".repeat(58);
  const mid = " ".repeat(58);

  const lines = [
    `+${border}+`,
    `|${mid}|`,
    `|${"CERTIFICATE OF COMPLETION".padStart(34)}${" ".repeat(24)}|`,
    `|${mid}|`,
    `|  This is to certify that${" ".repeat(30)}|`,
    `|${mid}|`,
    `|  ${userName.padEnd(54)}|`,
    `|${mid}|`,
    `|  has successfully completed the course${" ".repeat(16)}|`,
    `|${mid}|`,
    `|  \"${courseName.padEnd(52)}\"|`,
    `|${mid}|`,
    `|  Completion Date: ${formattedDate.padEnd(33)}|`,
    `|${mid}|`,
    `|  Issued by Ecotech${" ".repeat(40)}|`,
    `|  Internal Employee Learning Management System${" ".repeat(10)}|`,
    `|${mid}|`,
    `+${border}+`,
  ];

  const text = lines.join("\n");

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificate-${courseName.replace(/\s+/g, "-").toLowerCase()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success("Certificate downloaded successfully!");
}

export function CertificateModal({
  open,
  onOpenChange,
  userName,
  courseName,
  completionDate,
}: CertificateModalProps) {
  const formattedDate = new Date(completionDate).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 overflow-hidden"
        showCloseButton={false}
        aria-describedby="certificate-description"
      >
        {/* Decorative Certificate */}
        <div className="relative">
          {/* Outer gradient border */}
          <div className="m-4 rounded-lg bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 p-1">
            {/* Inner decorative border */}
            <div className="rounded-md border-2 border-dashed border-white/20 bg-gradient-to-br from-white to-cyan-50 dark:from-gray-900 dark:to-gray-950 p-6 sm:p-8">
              {/* Corner decorations */}
              <div className="pointer-events-none absolute top-8 left-8 h-8 w-8 border-t-2 border-l-2 border-cyan-400/50 sm:top-10 sm:left-10" />
              <div className="pointer-events-none absolute top-8 right-8 h-8 w-8 border-t-2 border-r-2 border-cyan-400/50 sm:top-10 sm:right-10" />
              <div className="pointer-events-none absolute bottom-8 left-8 h-8 w-8 border-b-2 border-l-2 border-cyan-400/50 sm:bottom-10 sm:left-10" />
              <div className="pointer-events-none absolute bottom-8 right-8 h-8 w-8 border-b-2 border-r-2 border-cyan-400/50 sm:bottom-10 sm:right-10" />

              {/* Certificate content */}
              <div className="flex flex-col items-center text-center">
                {/* Logo and Brand */}
                <div className="mb-4 flex items-center gap-2">
                  <img src="/ecotech-logo.png" alt="Ecotech" className="h-10 w-10 rounded-lg object-contain" />
                  <img src="/ecotech-name.png" alt="Ecotech" className="h-5 w-auto object-contain" />
                </div>

                {/* Decorative separator */}
                <div className="mb-5 flex items-center gap-2">
                  <div className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-400" />
                  <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <div className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-400" />
                </div>

                {/* Title */}
                <h2 className="mb-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Certificate of Completion
                </h2>
                <p
                  id="certificate-description"
                  className="mb-6 text-xs text-muted-foreground"
                >
                  Awarded for outstanding achievement in the course
                </p>

                {/* Certification statement */}
                <p className="mb-2 text-sm text-muted-foreground">
                  This is to certify that
                </p>

                {/* User name */}
                <h3 className="mb-5 text-xl font-extrabold text-foreground sm:text-2xl">
                  {userName}
                </h3>

                {/* Course name */}
                <p className="mb-1 text-sm text-muted-foreground">
                  has successfully completed the course
                </p>
                <h4 className="mb-6 max-w-sm rounded-md bg-gradient-to-r from-cyan-500/10 to-teal-500/10 px-4 py-2 text-base font-semibold text-foreground sm:text-lg">
                  &quot;{courseName}&quot;
                </h4>

                {/* Date */}
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Date:</span>{" "}
                  {formattedDate}
                </p>

                {/* Bottom decorative separator */}
                <div className="mt-6 flex items-center gap-2">
                  <div className="h-px w-16 bg-gradient-to-r from-transparent to-teal-400/50" />
                  <div className="h-1 w-1 rounded-full bg-teal-400/50" />
                  <div className="h-px w-16 bg-gradient-to-l from-transparent to-teal-400/50" />
                </div>

                {/* Footer */}
                <p className="mt-3 text-[10px] tracking-wider text-muted-foreground/70 uppercase">
                  Ecotech &mdash; Learning Management Platform
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Dialog header for accessibility (visually hidden) */}
        <DialogHeader className="sr-only">
          <DialogTitle>Certificate of Completion</DialogTitle>
          <DialogDescription>
            {`Certificate for ${userName} completing ${courseName}`}
          </DialogDescription>
        </DialogHeader>

        {/* Actions */}
        <DialogFooter className="flex-row gap-2 border-t border-border/50 bg-muted/30 px-6 py-4 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="gap-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Close
          </Button>
          <Button
            onClick={() =>
              handleDownloadCertificate(userName, courseName, completionDate)
            }
            className="gap-2 bg-gradient-to-r from-cyan-600 to-teal-500 text-white hover:from-cyan-700 hover:to-teal-600"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download Certificate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
