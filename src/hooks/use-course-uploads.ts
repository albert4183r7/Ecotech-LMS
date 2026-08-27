"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

// ============================================
// Cover image and reference document uploads for the course wizard
// ============================================

export interface ReferenceFile {
  name: string;
  url: string;
  size: number;
  type: string;
}

// SVG is deliberately absent: an SVG is a script-capable document, and covers
// are served from this application's own origin. The upload endpoint rejects it
// too — this list only keeps the file picker from offering it.
const VALID_COVER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
const MAX_COVER_BYTES = 5 * 1024 * 1024;

export function useCourseUploads() {
  const [coverImage, setCoverImage] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = () => fileInputRef.current?.click();

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!VALID_COVER_TYPES.includes(file.type)) {
      toast.error("Please select a valid image (JPEG, PNG, WebP, GIF or BMP)");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      toast.error("Image must be under 5MB");
      return;
    }

    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload?type=cover", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) {
        setCoverImage(json.data.url);
        setCoverPreview(json.data.url);
        toast.success("Cover image uploaded");
      } else {
        toast.error(json.error || "Failed to upload image");
      }
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setCoverUploading(false);
      // Reset so the same file can be re-selected.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDocUploadClick = () => docInputRef.current?.click();

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setDocUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload?type=doc", { method: "POST", body: formData });
        const json = await res.json();
        if (json.success) {
          setReferenceFiles((prev) => [...prev, json.data]);
          toast.success(`Uploaded: ${file.name}`);
        } else {
          toast.error(`Failed to upload: ${file.name}`);
        }
      }
    } catch {
      toast.error("Failed to upload document");
    } finally {
      setDocUploading(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  const handleRemoveDoc = (url: string) =>
    setReferenceFiles((prev) => prev.filter((f) => f.url !== url));

  const handleRemoveCover = () => {
    setCoverImage("");
    setCoverPreview(null);
  };

  return {
    coverImage,
    setCoverImage,
    coverPreview,
    setCoverPreview,
    coverUploading,
    docUploading,
    referenceFiles,
    setReferenceFiles,
    fileInputRef,
    docInputRef,
    handleCoverUpload,
    handleCoverFileChange,
    handleDocUploadClick,
    handleDocFileChange,
    handleRemoveDoc,
    handleRemoveCover,
  };
}
