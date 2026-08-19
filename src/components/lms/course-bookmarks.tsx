"use client";

import { useState, useCallback } from "react";
import { Bookmark, Plus, Trash2, FolderOpen, ChevronRight, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useNavigationStore } from "@/stores/lms-store";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BookmarkedCourse {
  id: string;
  title: string;
}

interface BookmarkCollection {
  id: string;
  name: string;
  courses: BookmarkedCourse[];
}

const STORAGE_KEY = "ecotech_collections";

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

function loadCollections(): BookmarkCollection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BookmarkCollection[]) : [];
  } catch {
    return [];
  }
}

function saveCollections(collections: BookmarkCollection[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
}

function generateId(): string {
  return `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ------------------------------------------------------------------ */
/*  Default collection                                                 */
/* ------------------------------------------------------------------ */

function getDefaultCollections(): BookmarkCollection[] {
  return [{ id: "default", name: "Saved for Later", courses: [] }];
}

/* ------------------------------------------------------------------ */
/*  CourseBookmarks Component                                          */
/* ------------------------------------------------------------------ */

export function CourseBookmarks() {
  const { openCourseDetail } = useNavigationStore();
  const [collections, setCollections] = useState<BookmarkCollection[]>(() => {
    const loaded = loadCollections();
    return loaded.length > 0 ? loaded : getDefaultCollections();
  });
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* Create collection */
  const handleCreateCollection = useCallback(() => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) {
      toast.error("Please enter a collection name");
      return;
    }
    if (collections.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("A collection with this name already exists");
      return;
    }
    const newCol: BookmarkCollection = {
      id: generateId(),
      name: trimmed,
      courses: [],
    };
    const updated = [...collections, newCol];
    setCollections(updated);
    saveCollections(updated);
    setNewCollectionName("");
    setShowCreateInput(false);
    toast.success(`Collection "${trimmed}" created`);
  }, [newCollectionName, collections]);

  /* Delete collection */
  const handleDeleteCollection = useCallback(
    (colId: string) => {
      const updated = collections.filter((c) => c.id !== colId);
      setCollections(updated);
      saveCollections(updated);
      toast.success("Collection deleted");
    },
    [collections],
  );

  /* Remove course from collection */
  const handleRemoveCourse = useCallback(
    (colId: string, courseId: string) => {
      const updated = collections.map((c) =>
        c.id === colId ? { ...c, courses: c.courses.filter((cr) => cr.id !== courseId) } : c,
      );
      setCollections(updated);
      saveCollections(updated);
    },
    [collections],
  );

  /* Navigate to course */
  const handleCourseClick = useCallback(
    (courseId: string) => {
      openCourseDetail(courseId);
    },
    [openCourseDetail],
  );

  /* Toggle expand */
  const toggleExpand = useCallback((colId: string) => {
    setExpandedId((prev) => (prev === colId ? null : colId));
  }, []);

  const totalCourses = collections.reduce((sum, c) => sum + c.courses.length, 0);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <Bookmark className="h-4 w-4 text-white" />
            </div>
            My Collections
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {totalCourses} courses
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Collections list */}
        <ScrollArea className="max-h-72">
          <div className="space-y-2">
            {collections.map((col) => {
              const isExpanded = expandedId === col.id;
              return (
                <div key={col.id} className="border-border/40 bg-muted/20 rounded-lg border">
                  {/* Collection header */}
                  <div className="flex items-center gap-2 p-3">
                    <button
                      onClick={() => toggleExpand(col.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{col.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {col.courses.length} {col.courses.length === 1 ? "course" : "courses"}
                        </p>
                      </div>
                      <ChevronRight
                        className={`text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    {/* Delete button (only for non-default collections) */}
                    {col.id !== "default" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Collection</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete &ldquo;{col.name}
                              &rdquo;? The courses themselves won&apos;t be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteCollection(col.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>

                  {/* Expanded course list */}
                  {isExpanded && (
                    <>
                      <Separator />
                      <div className="px-3 pt-1 pb-3">
                        {col.courses.length === 0 ? (
                          <p className="text-muted-foreground py-2 text-center text-xs">
                            No courses saved yet. Add courses from their detail page.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {col.courses.map((course) => (
                              <div
                                key={course.id}
                                className="group hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
                              >
                                <button
                                  onClick={() => handleCourseClick(course.id)}
                                  className="text-muted-foreground group-hover:text-foreground min-w-0 flex-1 truncate text-left transition-colors"
                                >
                                  {course.title}
                                </button>
                                <button
                                  onClick={() => handleRemoveCourse(col.id, course.id)}
                                  className="text-muted-foreground hover:text-destructive shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Add Collection */}
        {showCreateInput ? (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Collection name..."
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCollection();
                if (e.key === "Escape") {
                  setShowCreateInput(false);
                  setNewCollectionName("");
                }
              }}
              className="h-8 text-sm"
              autoFocus
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0"
              onClick={handleCreateCollection}
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0"
              onClick={() => {
                setShowCreateInput(false);
                setNewCollectionName("");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowCreateInput(true)}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            New Collection
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
