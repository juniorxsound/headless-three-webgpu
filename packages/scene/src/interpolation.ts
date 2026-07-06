import type {
  AnimationValueType,
  KeyframeInterpolation,
  KeyframeValue,
  SceneKeyframe,
  SceneTrack,
} from "./schema.js";

const defaultBezierHandles: readonly [number, number, number, number] = [0.42, 0, 0.58, 1];

export function sortTrackKeyframes(track: SceneTrack): readonly SceneKeyframe[] {
  return (Object.values(track.keyframes) as SceneKeyframe[]).sort((left, right) => {
    if (left.time === right.time) {
      return left.id.localeCompare(right.id);
    }
    return left.time - right.time;
  });
}

export function evaluateTrackAtTime(
  track: SceneTrack,
  time: number,
  sortedKeyframes: readonly SceneKeyframe[] = sortTrackKeyframes(track),
): KeyframeValue | undefined {
  if (sortedKeyframes.length === 0) {
    return undefined;
  }

  if (time <= sortedKeyframes[0]!.time) {
    return sortedKeyframes[0]!.value;
  }

  const lastKeyframe = sortedKeyframes.at(-1);
  if (lastKeyframe && time >= lastKeyframe.time) {
    return lastKeyframe.value;
  }

  for (let index = 0; index < sortedKeyframes.length - 1; index += 1) {
    const left = sortedKeyframes[index]!;
    const right = sortedKeyframes[index + 1]!;

    if (time < left.time || time > right.time) {
      continue;
    }

    if (time === right.time) {
      return right.value;
    }

    const span = right.time - left.time;
    const linearProgress = span === 0 ? 1 : (time - left.time) / span;
    return interpolateKeyframePair(track.valueType, left, right, linearProgress);
  }

  return lastKeyframe?.value;
}

function interpolateKeyframePair(
  valueType: AnimationValueType,
  left: SceneKeyframe,
  right: SceneKeyframe,
  linearProgress: number,
): KeyframeValue {
  const interpolation = left.interpolation ?? "linear";
  if (interpolation === "hold") {
    return left.value;
  }

  const easedProgress =
    interpolation === "bezier"
      ? solveCubicBezier(linearProgress, left.handles ?? defaultBezierHandles)
      : linearProgress;

  return interpolateAnimationValues(valueType, left.value, right.value, easedProgress);
}

export function solveCubicBezier(
  progress: number,
  handles: readonly [number, number, number, number],
): number {
  if (progress <= 0) {
    return 0;
  }

  if (progress >= 1) {
    return 1;
  }

  const [x1, y1, x2, y2] = handles;
  let t = progress;

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const x = cubicBezierCoordinate(t, x1, x2) - progress;
    const derivative = cubicBezierDerivative(t, x1, x2);

    if (Math.abs(x) < 1e-7) {
      return cubicBezierCoordinate(t, y1, y2);
    }

    if (Math.abs(derivative) < 1e-7) {
      break;
    }

    t -= x / derivative;
  }

  let low = 0;
  let high = 1;
  t = progress;

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const x = cubicBezierCoordinate(t, x1, x2);
    if (Math.abs(x - progress) < 1e-7) {
      break;
    }

    if (x > progress) {
      high = t;
    } else {
      low = t;
    }

    t = (low + high) / 2;
  }

  return cubicBezierCoordinate(t, y1, y2);
}

function cubicBezierCoordinate(t: number, p1: number, p2: number): number {
  const oneMinusT = 1 - t;
  return 3 * oneMinusT * oneMinusT * t * p1 + 3 * oneMinusT * t * t * p2 + t * t * t;
}

function cubicBezierDerivative(t: number, p1: number, p2: number): number {
  const oneMinusT = 1 - t;
  return 3 * oneMinusT * oneMinusT * p1 + 6 * oneMinusT * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

function interpolateAnimationValues(
  valueType: AnimationValueType,
  left: KeyframeValue,
  right: KeyframeValue,
  progress: number,
): KeyframeValue {
  switch (valueType) {
    case "number":
      return interpolateNumber(left as number, right as number, progress);
    case "vec2":
    case "vec3":
    case "vec4":
    case "quat":
      return interpolateTuple(left as readonly number[], right as readonly number[], progress);
    case "boolean":
    case "string":
    case "color":
      return progress < 1 ? left : right;
  }
}

function interpolateNumber(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}

function interpolateTuple(
  left: readonly number[],
  right: readonly number[],
  progress: number,
): KeyframeValue {
  const interpolated = left.map((value, index) =>
    interpolateNumber(value, right[index] ?? value, progress),
  );

  switch (interpolated.length) {
    case 2:
      return [interpolated[0]!, interpolated[1]!];
    case 3:
      return [interpolated[0]!, interpolated[1]!, interpolated[2]!];
    case 4:
      return [interpolated[0]!, interpolated[1]!, interpolated[2]!, interpolated[3]!];
    default:
      return interpolated[0] ?? 0;
  }
}

export function usesContinuousInterpolation(interpolation: KeyframeInterpolation): boolean {
  return interpolation === "linear" || interpolation === "bezier";
}
