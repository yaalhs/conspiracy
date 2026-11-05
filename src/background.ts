import OBR, {
  buildCurve,
  buildPath,
  buildShape,
  Command,
} from "@owlbear-rodeo/sdk";
import type { Item, PathCommand, Vector2 } from "@owlbear-rodeo/sdk";
import {
  DEFAULT_COLOR,
  DEFAULT_WIDTH,
  EXTENSION_ID,
  PIN_MODE_ID,
  PIN_SNAP_RADIUS,
  STRING_MODE_ID,
  TOOL_ID,
} from "./constants";

type ToolMetadata = {
  strokeColor?: string;
  strokeWidth?: number;
};

type PinSnap = {
  segment: number;
  progress: number;
  position: Vector2;
};

const icon = (path: string) =>
  new URL(path.replace(/^\//, ""), window.location.href).toString();

const PIN_COMMANDS: PathCommand[] = [
  [Command.MOVE, 0, 24],
  [Command.CUBIC, -4, 17, -16, 3, -16, -7],
  [Command.CUBIC, -16, -16, -9, -24, 0, -24],
  [Command.CUBIC, 9, -24, 16, -16, 16, -7],
  [Command.CUBIC, 16, 3, 4, 17, 0, 24],
  [Command.CLOSE],
];

let stringPoints: Vector2[] | null = null;

function getStyle(metadata: Record<string, unknown>): Required<ToolMetadata> {
  const color = metadata.strokeColor;
  const width = metadata.strokeWidth;
  return {
    strokeColor:
      typeof color === "string" && /^#[\da-f]{6}$/i.test(color)
        ? color
        : DEFAULT_COLOR,
    strokeWidth:
      typeof width === "number" && Number.isFinite(width) && width > 0
        ? width
        : DEFAULT_WIDTH,
  };
}

function isBoardPin(item: Item): boolean {
  const data = item.metadata[EXTENSION_ID];
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === "pin"
  );
}

function getPinAnchor(item: Item): Vector2 {
  const data = item.metadata[EXTENSION_ID];
  const offsetY =
    typeof data === "object" &&
    data !== null &&
    "snapOffsetY" in data &&
    typeof data.snapOffsetY === "number" &&
    Number.isFinite(data.snapOffsetY)
      ? data.snapOffsetY
      : 0;
  return { x: item.position.x, y: item.position.y + offsetY };
}

async function addPin(metadata: Record<string, unknown>, position: Vector2) {
  const { strokeColor, strokeWidth } = getStyle(metadata);
  const pinMetadata = {
    [EXTENSION_ID]: { kind: "pin", snapOffsetY: -8 },
  };

  const shadow = buildPath()
    .position({ x: position.x, y: position.y + 2 })
    .commands(PIN_COMMANDS)
    .fillColor("#111215")
    .fillOpacity(0.35)
    .strokeColor("#111215")
    .strokeOpacity(0.25)
    .strokeWidth(1)
    .name("Conspiracy pin shadow")
    .disableHit(true)
    .build();

  const pin = buildPath()
    .position(position)
    .commands(PIN_COMMANDS)
    .fillColor(strokeColor)
    .fillOpacity(1)
    .strokeColor("#f4e8d0")
    .strokeOpacity(0.95)
    .strokeWidth(Math.max(2, strokeWidth * 0.28))
    .name("Conspiracy pin")
    .metadata(pinMetadata)
    .build();

  const highlight = buildShape()
    .position({ x: position.x - 7, y: position.y - 16 })
    .width(7)
    .height(7)
    .shapeType("CIRCLE")
    .fillColor("#ffffff")
    .fillOpacity(0.5)
    .strokeOpacity(0)
    .name("Conspiracy pin highlight")
    .disableHit(true)
    .build();

  await OBR.scene.items.addItems([shadow, pin, highlight]);
}

function distanceBetween(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function addDragPoint(points: Vector2[], point: Vector2) {
  const last = points[points.length - 1];
  if (!last || distanceBetween(last, point) >= 2) points.push(point);
}

function findPinSnap(points: Vector2[], pin: Vector2): PinSnap | null {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSegment = 0;
  let bestProgress = 0;
  let pathProgress = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((pin.x - start.x) * dx + (pin.y - start.y) * dy) /
                lengthSquared,
            ),
          );
    const nearest = { x: start.x + t * dx, y: start.y + t * dy };
    const distance = distanceBetween(nearest, pin);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegment = i;
      bestProgress = pathProgress + t * length;
    }
    pathProgress += length;
  }

  if (bestDistance > PIN_SNAP_RADIUS) return null;
  return { segment: bestSegment, progress: bestProgress, position: pin };
}

function routeThroughPins(points: Vector2[], pins: Vector2[]): Vector2[] {
  const snaps = pins
    .map((pin) => findPinSnap(points, pin))
    .filter((snap): snap is PinSnap => snap !== null)
    .sort((a, b) => a.progress - b.progress);

  const bySegment = new Map<number, PinSnap[]>();
  for (const snap of snaps) {
    const segmentSnaps = bySegment.get(snap.segment) ?? [];
    segmentSnaps.push(snap);
    bySegment.set(snap.segment, segmentSnaps);
  }

  const routed = [points[0]];
  const append = (point: Vector2) => {
    const last = routed[routed.length - 1];
    if (distanceBetween(last, point) > 1) routed.push(point);
  };

  for (let segment = 0; segment < points.length - 1; segment += 1) {
    for (const snap of bySegment.get(segment) ?? []) append(snap.position);
    append(points[segment + 1]);
  }
  return routed;
}

async function addString(metadata: Record<string, unknown>, points: Vector2[]) {
  if (points.length < 2) return;

  const { strokeColor, strokeWidth } = getStyle(metadata);
  const pins = await OBR.scene.items.getItems(isBoardPin);
  const routedPoints = routeThroughPins(
    points,
    pins.map(getPinAnchor),
  );
  if (routedPoints.length < 2) return;

  const shadow = buildCurve()
    .points(routedPoints)
    .tension(0)
    .strokeColor("#17191d")
    .strokeOpacity(0.4)
    .strokeWidth(strokeWidth + 4)
    .name("Conspiracy string shadow")
    .disableHit(true)
    .build();

  const string = buildCurve()
    .points(routedPoints)
    .tension(0)
    .strokeColor(strokeColor)
    .strokeWidth(strokeWidth)
    .name("Conspiracy string")
    .metadata({ [EXTENSION_ID]: { kind: "string" } })
    .build();

  const weave = buildCurve()
    .points(routedPoints)
    .tension(0)
    .strokeColor("#fff2df")
    .strokeOpacity(0.34)
    .strokeWidth(Math.max(1, strokeWidth * 0.18))
    .strokeDash([1, 4])
    .name("Conspiracy string weave")
    .disableHit(true)
    .build();

  await OBR.scene.items.addItems([shadow, string, weave]);
}

function reportError(message: string, error: unknown) {
  console.error(message, error);
}

OBR.onReady(async () => {
  await OBR.tool.createMode({
    id: PIN_MODE_ID,
    icons: [{ icon: icon("/pin.svg"), label: "Pin" }],
    onToolClick: async (context, event) => {
      try {
        await addPin(context.metadata, event.pointerPosition);
      } catch (error) {
        reportError("Could not place conspiracy pin.", error);
      }
    },
  });

  await OBR.tool.createMode({
    id: STRING_MODE_ID,
    icons: [{ icon: icon("/string.svg"), label: "String" }],
    onToolDragStart: (_context, event) => {
      stringPoints = [event.pointerPosition];
    },
    onToolDragMove: (_context, event) => {
      if (stringPoints) addDragPoint(stringPoints, event.pointerPosition);
    },
    onToolDragEnd: async (context, event) => {
      if (!stringPoints) return;

      addDragPoint(stringPoints, event.pointerPosition);
      const points = stringPoints;
      stringPoints = null;
      if (points.length < 2) return;

      try {
        await addString(context.metadata, points);
      } catch (error) {
        reportError("Could not draw conspiracy string.", error);
      }
    },
    onToolDragCancel: () => {
      stringPoints = null;
    },
    onDeactivate: () => {
      stringPoints = null;
    },
  });

  await OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: icon("/pin.svg"), label: "Conspiracy Board" }],
    defaultMode: PIN_MODE_ID,
    defaultMetadata: {
      strokeColor: DEFAULT_COLOR,
      strokeWidth: DEFAULT_WIDTH,
    },
  });
});
