import type { Coordinate, RoutePoint } from "./models";
const rad = (n: number) => (n * Math.PI) / 180;
export const wrapLongitude = (n: number) => ((n + 540) % 360) - 180;
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(wrapLongitude(b.longitude - a.longitude)) / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const d = rad(wrapLongitude(b.longitude - a.longitude));
  return (
    ((Math.atan2(
      Math.sin(d) * Math.cos(rad(b.latitude)),
      Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) -
        Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(d),
    ) *
      180) /
      Math.PI +
      360) %
    360
  );
}
export function routeDistance(route: RoutePoint[]): number {
  return route
    .slice(1)
    .reduce(
      (sum, p, i) => sum + (p.segmentStart ? 0 : distanceMeters(route[i]!, p)),
      0,
    );
}
export const compassLabel = (bearing: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearing / 45) % 8]!;
