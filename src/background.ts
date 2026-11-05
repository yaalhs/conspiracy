import OBR, {
  buildCurve,
  buildPath,
  Command,
  isCurve,
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
  id: string;
  progress: number;
  position: Vector2;
};

type StringStyle = Required<ToolMetadata>;

const STRING_WIDTH_SCALE = 1.5;

const icon = (path: string) =>
  new URL(path.replace(/^\//, ""), window.location.href).toString();

const PIN_COMMANDS: PathCommand[] = [
  [Command.MOVE, 0, -32],
  [Command.LINE, -9, -35],
  [Command.LINE, -16, -40],
  [Command.LINE, -16, -45],
  [Command.LINE, -13, -49],
  [Command.LINE, -13, -66],
  [Command.LINE, -20, -70],
  [Command.LINE, -20, -75],
  [Command.QUAD, -20, -79, -15, -79],
  [Command.LINE, 15, -79],
  [Command.QUAD, 20, -79, 20, -75],
  [Command.LINE, 20, -70],
  [Command.LINE, 13, -66],
  [Command.LINE, 13, -49],
  [Command.LINE, 16, -45],
  [Command.LINE, 16, -40],
  [Command.LINE, 9, -35],
  [Command.CLOSE],
];

const NEEDLE_COMMANDS: PathCommand[] = [
  [Command.MOVE, -2, -34],
  [Command.LINE, -1, -3],
  [Command.LINE, 0, 0],
  [Command.LINE, 1, -3],
  [Command.LINE, 2, -34],
  [Command.CLOSE],
];

const PIN_HIGHLIGHT_COMMANDS: PathCommand[] = [
  [Command.MOVE, -17, -74],
  [Command.LINE, -14, -71],
  [Command.LINE, -7, -67],
  [Command.LINE, -7, -50],
  [Command.LINE, -10, -45],
  [Command.LINE, -10, -40],
  [Command.LINE, -5, -36],
  [Command.LINE, -11, -40],
  [Command.LINE, -11, -46],
  [Command.LINE, -9, -50],
  [Command.LINE, -9, -68],
  [Command.LINE, -16, -72],
  [Command.CLOSE],
];

const PIN_SHADE_COMMANDS: PathCommand[] = [
  [Command.MOVE, 2, -35],
  [Command.LINE, 9, -37],
  [Command.LINE, 16, -41],
  [Command.LINE, 16, -45],
  [Command.LINE, 13, -49],
  [Command.LINE, 13, -66],
  [Command.LINE, 20, -70],
  [Command.LINE, 20, -75],
  [Command.QUAD, 20, -79, 15, -79],
  [Command.LINE, 5, -79],
  [Command.CUBIC, 11, -76, 11, -71, 8, -68],
  [Command.LINE, 8, -51],
  [Command.LINE, 11, -46],
  [Command.LINE, 11, -41],
  [Command.LINE, 5, -37],
  [Command.LINE, 2, -35],
  [Command.CLOSE],
];

let stringPoints: Vector2[] | null = null;
let stringPreviewId: string | null = null;
let stringPreviewQueue: Promise<void> = Promise.resolve();
let stringGestureId = 0;

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
  return item.position;
}

async function addPin(metadata: Record<string, unknown>, position: Vector2) {
  const { strokeColor, strokeWidth } = getStyle(metadata);
  const pinMetadata = {
    [EXTENSION_ID]: { kind: "pin" },
  };

  const needleShadow = buildPath()
    .position({ x: position.x + 1, y: position.y + 2 })
    .commands(NEEDLE_COMMANDS)
    .fillColor("#111215")
    .fillOpacity(0.45)
    .strokeOpacity(0)
    .name("Conspiracy pin needle shadow")
    .disableHit(true)
    .build();

  const needle = buildPath()
    .position(position)
    .commands(NEEDLE_COMMANDS)
    .fillColor("#c5c8cd")
    .fillOpacity(1)
    .strokeColor("#62666d")
    .strokeWidth(0.7)
    .name("Conspiracy pin needle")
    .disableHit(true)
    .build();

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

  const shade = buildPath()
    .position(position)
    .commands(PIN_SHADE_COMMANDS)
    .fillColor("#421b24")
    .fillOpacity(0.24)
    .strokeOpacity(0)
    .name("Conspiracy pin shading")
    .disableHit(true)
    .build();

  const highlight = buildPath()
    .position(position)
    .commands(PIN_HIGHLIGHT_COMMANDS)
    .fillColor("#fff6e5")
    .fillOpacity(0.38)
    .strokeOpacity(0)
    .name("Conspiracy pin highlight")
    .disableHit(true)
    .build();

  await OBR.scene.items.addItems([
    needleShadow,
    needle,
    shadow,
    pin,
    shade,
    highlight,
  ]);
}

function distanceBetween(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function addDragPoint(points: Vector2[], point: Vector2) {
  const last = points[points.length - 1];
  if (!last || distanceBetween(last, point) >= 2) points.push(point);
}

function findPinSnap(points: Vector2[], pin: Item): PinSnap | null {
  const position = getPinAnchor(pin);
  let bestDistance = Number.POSITIVE_INFINITY;
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
              ((position.x - start.x) * dx + (position.y - start.y) * dy) /
                lengthSquared,
            ),
          );
    const nearest = { x: start.x + t * dx, y: start.y + t * dy };
    const distance = distanceBetween(nearest, position);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = pathProgress + t * length;
    }
    pathProgress += length;
  }

  if (bestDistance > PIN_SNAP_RADIUS) return null;
  return {
    id: pin.id,
    progress: bestProgress,
    position,
  };
}

function routeThroughPins(points: Vector2[], pins: Item[]): Vector2[] {
  const snaps = pins
    .map((pin) => findPinSnap(points, pin))
    .filter((snap): snap is PinSnap => snap !== null)
    .sort((a, b) => a.progress - b.progress);
  const seen = new Set<string>();
  return snaps.flatMap((snap) => {
    if (seen.has(snap.id)) return [];
    seen.add(snap.id);
    return [snap.position];
  });
}

function addStringPreview(points: Vector2[], style: StringStyle, gestureId: number) {
  stringPreviewQueue = stringPreviewQueue
    .then(async () => {
      if (gestureId !== stringGestureId || points.length < 2) return;
      const strokeWidth = style.strokeWidth * STRING_WIDTH_SCALE;

      if (stringPreviewId) {
        const previewId = stringPreviewId;
        await OBR.scene.items.updateItems(
          (item) => item.id === previewId,
          (items) => {
            const preview = items.find(isCurve);
            if (!preview) return;
            preview.points = points;
            preview.style.strokeColor = style.strokeColor;
            preview.style.strokeWidth = strokeWidth;
          },
        );
        return;
      }

      const preview = buildCurve()
        .points(points)
        .tension(0)
        .strokeColor(style.strokeColor)
        .strokeOpacity(0.82)
        .strokeWidth(strokeWidth)
        .name("Conspiracy string preview")
        .metadata({ [EXTENSION_ID]: { kind: "string-preview" } })
        .disableHit(true)
        .build();
      await OBR.scene.items.addItems([preview]);
      stringPreviewId = preview.id;
    })
    .catch((error: unknown) => {
      reportError("Could not update the string trail.", error);
    });
}

async function clearStringPreview() {
  await stringPreviewQueue;
  const previewId = stringPreviewId;
  stringPreviewId = null;
  if (previewId) await OBR.scene.items.deleteItems([previewId]);
}

async function addString(metadata: Record<string, unknown>, points: Vector2[]) {
  if (points.length < 2) return;

  const { strokeColor, strokeWidth } = getStyle(metadata);
  const pins = await OBR.scene.items.getItems(isBoardPin);
  const snappedPins = routeThroughPins(points, pins);
  if (snappedPins.length < 2) return;
  const stringWidth = strokeWidth * STRING_WIDTH_SCALE;

  const shadow = buildCurve()
    .points(snappedPins)
    .tension(0)
    .strokeColor("#17191d")
    .strokeOpacity(0.4)
    .strokeWidth(stringWidth + 4)
    .name("Conspiracy string shadow")
    .disableHit(true)
    .build();

  const string = buildCurve()
    .points(snappedPins)
    .tension(0)
    .strokeColor(strokeColor)
    .strokeWidth(stringWidth)
    .name("Conspiracy string")
    .metadata({ [EXTENSION_ID]: { kind: "string" } })
    .build();

  const weave = buildCurve()
    .points(snappedPins)
    .tension(0)
    .strokeColor("#fff2df")
    .strokeOpacity(0.34)
    .strokeWidth(Math.max(1, stringWidth * 0.18))
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
      stringGestureId += 1;
      stringPoints = [event.pointerPosition];
    },
    onToolDragMove: (context, event) => {
      if (!stringPoints) return;
      addDragPoint(stringPoints, event.pointerPosition);
      addStringPreview(
        [...stringPoints],
        getStyle(context.metadata),
        stringGestureId,
      );
    },
    onToolDragEnd: async (context, event) => {
      if (!stringPoints) return;

      addDragPoint(stringPoints, event.pointerPosition);
      const points = stringPoints;
      const gestureId = stringGestureId;
      addStringPreview([...points], getStyle(context.metadata), gestureId);
      await stringPreviewQueue;
      if (gestureId !== stringGestureId) return;
      stringPoints = null;

      try {
        await clearStringPreview();
        await addString(context.metadata, points);
      } catch (error) {
        reportError("Could not draw conspiracy string.", error);
      }
    },
    onToolDragCancel: async () => {
      stringPoints = null;
      stringGestureId += 1;
      try {
        await clearStringPreview();
      } catch (error) {
        reportError("Could not clear the cancelled string trail.", error);
      }
    },
    onDeactivate: async () => {
      stringPoints = null;
      stringGestureId += 1;
      try {
        await clearStringPreview();
      } catch (error) {
        reportError("Could not clear the string trail.", error);
      }
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
