import { evaluateTrackAtTime, sortTrackKeyframes } from "./interpolation.js";
import type {
  SceneCamera,
  SceneDocument,
  SceneLight,
  SceneObject,
  SceneSequence,
  SceneTrack,
  SceneView,
} from "./schema.js";

export interface EvaluateSceneOptions {
  readonly sequenceId?: string;
  readonly time?: number;
}

export interface EvaluatedSceneState {
  readonly document: SceneDocument;
  readonly sequenceId?: string | undefined;
  readonly time: number;
  readonly objects: Record<string, SceneObject>;
  readonly cameras: Record<string, SceneCamera>;
  readonly lights: Record<string, SceneLight>;
  readonly views: Record<string, SceneView>;
}

export interface SceneDocumentSummary {
  readonly assets: number;
  readonly objects: number;
  readonly cameras: number;
  readonly lights: number;
  readonly views: number;
  readonly sequences: number;
  readonly tracks: number;
  readonly keyframes: number;
}

type SceneTargetBuckets = Pick<EvaluatedSceneState, "objects" | "cameras" | "lights" | "views">;

function resolveSequence(document: SceneDocument, sequenceId?: string): SceneSequence | undefined {
  if (sequenceId) {
    return document.sequences[sequenceId];
  }

  if (document.activeSequenceId) {
    return document.sequences[document.activeSequenceId];
  }

  return Object.values(document.sequences)[0];
}

function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) {
    throw new Error(`Invalid empty track path "${path}"`);
  }

  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const next = cursor[segment];
    if (typeof next === "object" && next !== null && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>;
      continue;
    }

    const replacement: Record<string, unknown> = {};
    cursor[segment] = replacement;
    cursor = replacement;
  }

  cursor[segments.at(-1)!] = value;
}

function getTrackTargetContainer(
  buckets: SceneTargetBuckets,
  track: SceneTrack,
): Record<string, unknown> | undefined {
  switch (track.target.type) {
    case "object":
      return buckets.objects[track.target.id] as unknown as Record<string, unknown> | undefined;
    case "camera":
      return buckets.cameras[track.target.id] as unknown as Record<string, unknown> | undefined;
    case "light":
      return buckets.lights[track.target.id] as unknown as Record<string, unknown> | undefined;
    case "view":
      return buckets.views[track.target.id] as unknown as Record<string, unknown> | undefined;
  }
}

function applyTrackAtTime(
  buckets: SceneTargetBuckets,
  track: SceneTrack,
  time: number,
  keyframes = sortTrackKeyframes(track),
): void {
  const target = getTrackTargetContainer(buckets, track);
  if (!target) {
    return;
  }

  const value = evaluateTrackAtTime(track, time, keyframes);
  if (value === undefined) {
    return;
  }

  setValueAtPath(target, track.target.path, structuredClone(value));
}

export function evaluateSceneDocument(
  document: SceneDocument,
  options: EvaluateSceneOptions = {},
): EvaluatedSceneState {
  const time = options.time ?? 0;
  const objects = structuredClone(document.objects);
  const cameras = structuredClone(document.cameras);
  const lights = structuredClone(document.lights);
  const views = structuredClone(document.views);
  const sequence = resolveSequence(document, options.sequenceId);

  if (sequence) {
    for (const track of Object.values(sequence.tracks)) {
      applyTrackAtTime({ objects, cameras, lights, views }, track, time);
    }
  }

  return {
    document,
    sequenceId: sequence?.id,
    time,
    objects,
    cameras,
    lights,
    views,
  };
}

export function summarizeSceneDocument(document: SceneDocument): SceneDocumentSummary {
  let tracks = 0;
  let keyframes = 0;

  for (const sequence of Object.values(document.sequences) as SceneSequence[]) {
    const sequenceTracks = Object.values(sequence.tracks) as SceneTrack[];
    tracks += sequenceTracks.length;
    for (const track of sequenceTracks) {
      keyframes += Object.keys(track.keyframes).length;
    }
  }

  return {
    assets: Object.keys(document.assets).length,
    objects: Object.keys(document.objects).length,
    cameras: Object.keys(document.cameras).length,
    lights: Object.keys(document.lights).length,
    views: Object.keys(document.views).length,
    sequences: Object.keys(document.sequences).length,
    tracks,
    keyframes,
  };
}

export function resolveSceneDuration(
  document: SceneDocument,
  sequenceId?: string,
): { durationSeconds: number; fps: number; sequenceId?: string } {
  const sequence = resolveSequence(document, sequenceId);
  if (!sequence) {
    return {
      durationSeconds: 1,
      fps: 24,
    };
  }

  const keyframeTimes = (Object.values(sequence.tracks) as SceneTrack[]).flatMap((track) =>
    Object.values(track.keyframes).map((keyframe) => keyframe.time),
  );
  const derivedDuration = keyframeTimes.length > 0 ? Math.max(...keyframeTimes) : 1;

  return {
    durationSeconds: sequence.duration ?? Math.max(derivedDuration, 1 / (sequence.fps ?? 24)),
    fps: sequence.fps ?? 24,
    sequenceId: sequence.id,
  };
}
