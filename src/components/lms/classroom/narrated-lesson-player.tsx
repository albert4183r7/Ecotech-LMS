"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { ClassroomSlide, LessonVideoItem } from "@/types/lms";

interface NarratedLessonPlayerProps {
  slides: Pick<ClassroomSlide, "id" | "title" | "htmlBody">[];
  video: LessonVideoItem;
  sceneIndex: number;
  onSceneChange: (index: number) => void;
  onFinish?: () => void;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * A lesson-video experience composed from the final slides and one MP3 scene
 * per slide. It intentionally does not pretend to be an encoded MP4: keeping
 * scenes separate gives learners captions, speed controls and direct navigation.
 */
export function NarratedLessonPlayer({
  slides,
  video,
  sceneIndex,
  onSceneChange,
  onFinish,
  className = "",
}: NarratedLessonPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const keepPlayingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [speed, setSpeed] = useState(1);
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [timing, setTiming] = useState({ sceneId: "", currentTime: 0, duration: 0 });
  const [audioError, setAudioError] = useState<{ sceneId: string; message: string } | null>(null);

  const scenes = useMemo(
    () =>
      [...video.scenes]
        .filter((scene) => scene.status === "READY")
        .sort((a, b) => a.order - b.order),
    [video.scenes],
  );
  const safeIndex = Math.min(Math.max(sceneIndex, 0), Math.max(0, scenes.length - 1));
  const scene = scenes[safeIndex] ?? null;
  const slide = scene ? slides.find((candidate) => candidate.id === scene.slideId) : null;
  const currentTime = timing.sceneId === scene?.id ? timing.currentTime : 0;
  const duration = timing.sceneId === scene?.id ? timing.duration : 0;
  const visibleAudioError = audioError?.sceneId === scene?.id ? audioError.message : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    audio.playbackRate = speed;
  }, [volume, muted, speed]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const continuePlaying = keepPlayingRef.current;
    audio.pause();
    audio.load();
    if (continuePlaying && scene?.audioUrl) {
      void audio.play().catch(() => {
        keepPlayingRef.current = false;
        setPlaying(false);
      });
    }
  }, [scene?.id, scene?.audioUrl]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !scene?.audioUrl) return;
    if (audio.paused) {
      try {
        await audio.play();
        keepPlayingRef.current = true;
        setPlaying(true);
      } catch {
        setAudioError({
          sceneId: scene.id,
          message: "Audio could not be played in this browser.",
        });
      }
    } else {
      audio.pause();
      keepPlayingRef.current = false;
      setPlaying(false);
    }
  }, [scene?.audioUrl]);

  const goPrevious = useCallback(() => {
    if (safeIndex === 0) return;
    onSceneChange(safeIndex - 1);
  }, [safeIndex, onSceneChange]);

  const goNext = useCallback(() => {
    if (safeIndex < scenes.length - 1) {
      onSceneChange(safeIndex + 1);
      return;
    }
    keepPlayingRef.current = false;
    setPlaying(false);
    onFinish?.();
  }, [safeIndex, scenes.length, onSceneChange, onFinish]);

  const onEnded = useCallback(() => {
    if (safeIndex < scenes.length - 1) {
      keepPlayingRef.current = true;
      setPlaying(true);
      onSceneChange(safeIndex + 1);
      return;
    }
    keepPlayingRef.current = false;
    setPlaying(false);
    onFinish?.();
  }, [safeIndex, scenes.length, onSceneChange, onFinish]);

  if (!scene || !slide) {
    return (
      <div
        className={`bg-card mx-auto flex aspect-video w-full max-w-6xl items-center justify-center rounded-xl border p-6 text-center ${className}`}
        style={{ maxWidth: "min(72rem, max(20rem, calc((100svh - 14rem) * 16 / 9)))" }}
      >
        <p className="text-muted-foreground text-sm">
          This narrated lesson has no playable scenes. Regenerate it after all slides are ready.
        </p>
      </div>
    );
  }

  return (
    <section
      className={`bg-card mx-auto w-full max-w-6xl overflow-hidden rounded-xl border shadow-sm ${className}`}
      style={{ maxWidth: "min(72rem, max(20rem, calc((100svh - 14rem) * 16 / 9)))" }}
    >
      <div className="relative overflow-hidden bg-black">
        <iframe
          key={scene.id}
          srcDoc={slide.htmlBody}
          sandbox="allow-scripts"
          className="animate-in fade-in-0 zoom-in-95 block w-full border-0 duration-500 motion-reduce:animate-none"
          style={{ aspectRatio: "16 / 9" }}
          title={`Narrated scene ${safeIndex + 1}: ${slide.title}`}
        />
        {captionsVisible && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pt-12 pb-4">
            <p className="max-h-24 max-w-4xl overflow-y-auto rounded-md bg-black/65 px-3 py-2 text-center text-sm leading-relaxed text-white shadow sm:text-base">
              {scene.caption}
            </p>
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={scene.audioUrl ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) =>
          setTiming((previous) => ({
            sceneId: scene.id,
            currentTime: event.currentTarget.currentTime,
            duration:
              previous.sceneId === scene.id ? previous.duration : event.currentTarget.duration,
          }))
        }
        onLoadedMetadata={(event) =>
          setTiming({
            sceneId: scene.id,
            currentTime: event.currentTarget.currentTime,
            duration: event.currentTarget.duration,
          })
        }
        onEnded={onEnded}
        onError={() => {
          keepPlayingRef.current = false;
          setPlaying(false);
          setAudioError({
            sceneId: scene.id,
            message: "This scene's narration audio is unavailable.",
          });
        }}
      />

      <div className="space-y-3 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
            {formatTime(currentTime)}
          </span>
          <Slider
            aria-label="Narration position"
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.1}
            value={[Math.min(currentTime, Math.max(duration, 0.01))]}
            onValueChange={([value]) => {
              const audio = audioRef.current;
              if (audio) audio.currentTime = value;
              setTiming({ sceneId: scene.id, currentTime: value, duration });
            }}
            className="flex-1"
          />
          <span className="text-muted-foreground w-10 text-xs tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? "Unmute narration" : "Mute narration"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <Slider
              aria-label="Narration volume"
              min={0}
              max={1}
              step={0.05}
              value={[volume]}
              onValueChange={([value]) => {
                setVolume(value);
                if (value > 0) setMuted(false);
              }}
              className="hidden w-20 sm:flex"
            />
            <Button
              type="button"
              variant={captionsVisible ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setCaptionsVisible((value) => !value)}
              aria-label={captionsVisible ? "Hide captions" : "Show captions"}
            >
              <Captions className="h-4 w-4" />
            </Button>
            <label className="text-muted-foreground ml-1 flex items-center gap-1 text-xs">
              <span className="sr-only">Playback speed</span>
              <select
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                aria-label="Playback speed"
              >
                {[0.75, 1, 1.25, 1.5, 2].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goPrevious}
              disabled={safeIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              type="button"
              size="icon"
              className="rounded-full"
              onClick={togglePlayback}
              aria-label={playing ? "Pause narration" : "Play narration"}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={goNext}>
              <span className="hidden sm:inline">
                {safeIndex === scenes.length - 1 ? "Finish" : "Next"}
              </span>
              {safeIndex === scenes.length - 1 ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="text-muted-foreground min-w-32 text-right text-xs tabular-nums">
            Scene {safeIndex + 1} of {scenes.length}
          </p>
        </div>

        {visibleAudioError && (
          <p className="text-destructive text-center text-xs">{visibleAudioError}</p>
        )}
        <p className="text-muted-foreground text-center text-[11px]">
          Narration uses an AI-generated voice ({video.voice}).
        </p>
      </div>
    </section>
  );
}
