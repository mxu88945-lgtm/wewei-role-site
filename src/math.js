// Original source: pwa-sense-bridge by 0xblewalker (https://github.com/0xblewalker/pwa-sense-bridge).
// Licensed under AGPL-3.0-only. This attribution and license notice are retained.
export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function normalizeAngle(value) {
  let angle = Number(value) || 0;
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

export function angleDelta(value, origin) {
  return normalizeAngle((Number(value) || 0) - (Number(origin) || 0));
}

export function circularMean(values) {
  if (!Array.isArray(values) || !values.length) return 0;
  let sin = 0;
  let cos = 0;
  for (const value of values) {
    const radians = Number(value) * Math.PI / 180;
    sin += Math.sin(radians);
    cos += Math.cos(radians);
  }
  return Math.atan2(sin, cos) * 180 / Math.PI;
}

export function screenGravity(gravity, screenAngle = 0) {
  const x = Number(gravity?.x) || 0;
  const y = Number(gravity?.y) || 0;
  const angle = ((Number(screenAngle) % 360) + 360) % 360;
  if (angle === 90) return { x: -y, y: x, angle };
  if (angle === 180) return { x: -x, y: -y, angle };
  if (angle === 270) return { x: y, y: -x, angle };
  return { x, y, angle: 0 };
}

export function gravityRoll(gravity, screenAngle = 0) {
  const corrected = screenGravity(gravity, screenAngle);
  return Math.atan2(corrected.x, -corrected.y) * 180 / Math.PI;
}

export function classifyRotation(side, tilt = 0, thresholds = {}) {
  const sideThreshold = thresholds.side ?? 32;
  const tiltThreshold = thresholds.tilt ?? 38;
  if (Math.abs(side) >= sideThreshold) {
    return { direction: side > 0 ? 'right' : 'left', amount: Math.abs(side) };
  }
  if (Math.abs(tilt) >= tiltThreshold) {
    return { direction: tilt > 0 ? 'forward' : 'back', amount: Math.abs(tilt) };
  }
  return null;
}
