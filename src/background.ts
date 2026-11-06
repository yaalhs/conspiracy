import OBR, {
  buildCurve,
  buildLine,
  buildPath,
  Command,
  isCurve,
} from "@owlbear-rodeo/sdk";
import type { Item, PathCommand, Vector2 } from "@owlbear-rodeo/sdk";
import {
  DRAW_TOOL_ID,
  DEFAULT_COLOR,
  DEFAULT_WIDTH,
  EXTENSION_ID,
  LEGACY_COLOR_ACTION_ID,
  PIN_MODE_ID,
  PIN_SNAP_RADIUS,
  STRING_MODE_ID,
  TOOL_ID,
} from "./constants";

type ToolMetadata = {
  strokeColor?: string;
  fillColor?: string;
  fillOpacity?: number;
  strokeWidth?: number;
};

type PinSnap = {
  id: string;
  progress: number;
  position: Vector2;
};

type StringStyle = Required<ToolMetadata>;

const STRING_WIDTH_SCALE = 2.25;
const PIN_MIN_SIZE_SCALE = 0.1;
const PIN_SIZE_SCALE_AT_90_OPACITY = 0.6;
const PIN_REFERENCE_FILL_OPACITY = 0.9;

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

function scalePathCommands(
  commands: PathCommand[],
  scale: number,
): PathCommand[] {
  return commands.map((command): PathCommand => {
    switch (command[0]) {
      case Command.MOVE:
      case Command.LINE:
        return [command[0], command[1] * scale, command[2] * scale];
      case Command.QUAD:
        return [
          command[0],
          command[1] * scale,
          command[2] * scale,
          command[3] * scale,
          command[4] * scale,
        ];
      case Command.CUBIC:
        return [
          command[0],
          command[1] * scale,
          command[2] * scale,
          command[3] * scale,
          command[4] * scale,
          command[5] * scale,
          command[6] * scale,
        ];
      case Command.CONIC:
        return [
          command[0],
          command[1] * scale,
          command[2] * scale,
          command[3] * scale,
          command[4] * scale,
          command[5],
        ];
      case Command.CLOSE:
        return command;
    }
  });
}

let stringPoints: Vector2[] | null = null;
let stringPreviewId: string | null = null;
let stringPreviewQueue: Promise<void> = Promise.resolve();
let pendingStringPreview: {
  points: Vector2[];
  style: StringStyle;
  gestureId: number;
} | null = null;
let stringPreviewUpdating = false;
let stringGestureId = 0;

function getStyle(metadata: Record<string, unknown>): Required<ToolMetadata> {
  const isColor = (value: unknown): value is string =>
    typeof value === "string" && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value);
  const fillOpacity =
    typeof metadata.fillOpacity === "number" &&
    Number.isFinite(metadata.fillOpacity)
      ? Math.max(0, Math.min(1, metadata.fillOpacity))
      : PIN_REFERENCE_FILL_OPACITY;
  return {
    strokeColor: isColor(metadata.strokeColor)
      ? metadata.strokeColor
      : DEFAULT_COLOR,
    fillColor: isColor(metadata.fillColor) ? metadata.fillColor : DEFAULT_COLOR,
    fillOpacity,
    strokeWidth:
      typeof metadata.strokeWidth === "number" &&
      Number.isFinite(metadata.strokeWidth) &&
      metadata.strokeWidth > 0
        ? metadata.strokeWidth
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

function isStringPreview(item: Item): boolean {
  const data = item.metadata[EXTENSION_ID];
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === "string-preview"
  );
}

async function clearStaleStringPreviews() {
  const playerId = await OBR.player.getId();
  const [sharedPreviews, localPreviews] = await Promise.all([
    OBR.scene.items.getItems(
      (item) => isStringPreview(item) && item.createdUserId === playerId,
    ),
    OBR.scene.local.getItems(isStringPreview),
  ]);
  await Promise.all([
    sharedPreviews.length > 0
      ? OBR.scene.items.deleteItems(sharedPreviews.map((item) => item.id))
      : Promise.resolve(),
    localPreviews.length > 0
      ? OBR.scene.local.deleteItems(localPreviews.map((item) => item.id))
      : Promise.resolve(),
  ]);
}

async function addPin(metadata: Record<string, unknown>, position: Vector2) {
  const { fillColor, fillOpacity, strokeWidth } = getStyle(metadata);
  const pinSizeScale =
    PIN_MIN_SIZE_SCALE +
    (fillOpacity / PIN_REFERENCE_FILL_OPACITY) *
      (PIN_SIZE_SCALE_AT_90_OPACITY - PIN_MIN_SIZE_SCALE);
  const pinOffsetScale = pinSizeScale / PIN_SIZE_SCALE_AT_90_OPACITY;
  const pinCommands = scalePathCommands(PIN_COMMANDS, pinSizeScale);
  const needleCommands = scalePathCommands(NEEDLE_COMMANDS, pinSizeScale);
  const highlightCommands = scalePathCommands(
    PIN_HIGHLIGHT_COMMANDS,
    pinSizeScale,
  );
  const shadeCommands = scalePathCommands(PIN_SHADE_COMMANDS, pinSizeScale);
  const pinMetadata = {
    [EXTENSION_ID]: { kind: "pin", shape: "thumbtack" },
  };

  const needleShadow = buildPath()
    .position({
      x: position.x + pinOffsetScale,
      y: position.y + 2 * pinOffsetScale,
    })
    .commands(needleCommands)
    .layer("PROP")
    .fillColor("#111215")
    .fillOpacity(0.45)
    .strokeOpacity(0)
    .name("Conspiracy pin needle shadow")
    .disableHit(true)
    .build();

  const needle = buildPath()
    .position(position)
    .commands(needleCommands)
    .layer("PROP")
    .fillColor("#c5c8cd")
    .fillOpacity(1)
    .strokeColor("#62666d")
    .strokeWidth(0.7)
    .name("Conspiracy pin needle")
    .disableHit(true)
    .build();

  const base = buildPath()
    .position(position)
    .commands(pinCommands)
    .layer("PROP")
    .fillColor(fillColor)
    .fillOpacity(1)
    .strokeColor(fillColor)
    .strokeOpacity(1)
    .strokeWidth(Math.max(2, strokeWidth * 0.28))
    .name("Conspiracy pin")
    .metadata(pinMetadata)
    .build();

  const shadow = buildPath()
    .position({ x: position.x, y: position.y + 2 * pinOffsetScale })
    .commands(pinCommands)
    .layer("PROP")
    .fillColor("#111215")
    .fillOpacity(0.35)
    .strokeColor("#111215")
    .strokeOpacity(0.25)
    .strokeWidth(1)
    .name("Conspiracy pin shadow")
    .disableHit(true)
    .build();

  const shade = buildPath()
    .position({
      x: position.x + 3 * pinOffsetScale,
      y: position.y + 2 * pinOffsetScale,
    })
    .commands(shadeCommands)
    .layer("PROP")
    .fillColor("#421b24")
    .fillOpacity(0.24)
    .strokeOpacity(0)
    .name("Conspiracy pin shading")
    .disableHit(true)
    .build();

  const highlight = buildPath()
    .position(position)
    .commands(highlightCommands)
    .layer("PROP")
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
    base,
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
  const position = pin.position;
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
  pendingStringPreview = { points, style, gestureId };
  if (stringPreviewUpdating) return;

  stringPreviewUpdating = true;
  stringPreviewQueue = (async () => {
    try {
      while (pendingStringPreview) {
        const request = pendingStringPreview;
        pendingStringPreview = null;
        if (
          request.gestureId !== stringGestureId ||
          request.points.length < 2
        ) {
          continue;
        }

        const currentPoints = [...request.points];
        const strokeWidth = request.style.strokeWidth * STRING_WIDTH_SCALE;

        if (stringPreviewId) {
          const previewId = stringPreviewId;
          await OBR.scene.local.updateItems(
            (item) => item.id === previewId,
            (items) => {
              const preview = items.find(isCurve);
              if (!preview) return;
              preview.points = currentPoints;
              preview.style.fillOpacity = 0;
              preview.style.closed = false;
              preview.style.strokeColor = request.style.strokeColor;
              preview.style.strokeWidth = strokeWidth;
            },
          );
          continue;
        }

        const preview = buildCurve()
          .points(currentPoints)
          .closed(false)
          .tension(0)
          .fillOpacity(0)
          .strokeColor(request.style.strokeColor)
          .strokeOpacity(0.82)
          .strokeWidth(strokeWidth)
          .name("Conspiracy string preview")
          .metadata({ [EXTENSION_ID]: { kind: "string-preview" } })
          .disableHit(true)
          .build();
        await OBR.scene.local.addItems([preview]);
        stringPreviewId = preview.id;
      }
    } catch (error: unknown) {
      reportError("Could not update the string trail.", error);
    } finally {
      stringPreviewUpdating = false;
    }
  })();
}

async function clearStringPreview() {
  await stringPreviewQueue;
  const previewId = stringPreviewId;
  stringPreviewId = null;
  if (previewId) await OBR.scene.local.deleteItems([previewId]);
}

async function addString(metadata: Record<string, unknown>, points: Vector2[]) {
  if (points.length < 2) return;

  const { strokeColor, strokeWidth } = getStyle(metadata);
  const pins = await OBR.scene.items.getItems(isBoardPin);
  const snappedPins = routeThroughPins(points, pins);
  if (snappedPins.length < 2) return;
  const stringWidth = strokeWidth * STRING_WIDTH_SCALE;
  const segments = snappedPins.slice(1).flatMap((endPosition, index) => {
    const startPosition = snappedPins[index];
    return [
      buildLine()
        .startPosition(startPosition)
        .endPosition(endPosition)
        .strokeColor(strokeColor)
        .strokeWidth(stringWidth)
        .name("Conspiracy string")
        .metadata({ [EXTENSION_ID]: { kind: "string" } })
        .build(),
      buildLine()
        .startPosition(startPosition)
        .endPosition(endPosition)
        .strokeColor("#fff2df")
        .strokeOpacity(0.34)
        .strokeWidth(Math.max(1, stringWidth * 0.18))
        .strokeDash([1, 4])
        .name("Conspiracy string weave")
        .disableHit(true)
        .build(),
    ];
  });

  await OBR.scene.items.addItems(segments);
}

function reportError(message: string, error: unknown) {
  console.error(message, error);
}

OBR.onReady(async () => {
  try {
    await OBR.tool.remove(TOOL_ID);
  } catch (error) {
    reportError("Could not remove the old Conspiracy Board toolbar tool.", error);
  }

  try {
    await OBR.tool.remove(LEGACY_COLOR_ACTION_ID);
  } catch (error) {
    reportError("Could not remove the old Conspiracy Board color action.", error);
  }

  await OBR.tool.createMode({
    id: PIN_MODE_ID,
    icons: [
      {
        icon: icon("/pin.svg?v=1.11.0"),
        label: "Pin",
        filter: { activeTools: [DRAW_TOOL_ID] },
      },
    ],
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
    icons: [
      {
        icon: icon("/string.svg?v=1.11.0"),
        label: "String",
        filter: { activeTools: [DRAW_TOOL_ID] },
      },
    ],
    onToolDragStart: (_context, event) => {
      stringGestureId += 1;
      stringPoints = [event.pointerPosition];
    },
    onToolDragMove: (context, event) => {
      if (!stringPoints) return;
      addDragPoint(stringPoints, event.pointerPosition);
      addStringPreview(
        stringPoints,
        getStyle(context.metadata),
        stringGestureId,
      );
    },
    onToolDragEnd: async (context, event) => {
      if (!stringPoints) return;

      addDragPoint(stringPoints, event.pointerPosition);
      const points = stringPoints;
      const gestureId = stringGestureId;
      addStringPreview(points, getStyle(context.metadata), gestureId);
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

  void clearStaleStringPreviews().catch((error: unknown) => {
    reportError("Could not clear stale string trails.", error);
  });
});
