// ============================================
// Browser download helpers
//
// Both the course page and the classroom built the same object-URL anchor and
// the same filename slug inline, and they had drifted apart. Sharing them keeps
// exported decks named consistently.
// ============================================

/** Slugify a title into something safe for a filename. */
export function safeFileName(title: string, maxLength = 60): string {
  const slug = title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, maxLength);
  return slug || "download";
}

/** Hand a blob to the browser as a file download. */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
