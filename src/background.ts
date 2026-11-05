import OBR, {
  buildCurve,
  buildLine,
  buildPath,
  Command,
  isCurve,
} from "@owlbear-rodeo/sdk";
import type { Item, PathCommand, Vector2 } from "@owlbear-rodeo/sdk";
import {
  COLOR_ACTION_ID,
  COLOR_POPOVER_ID,
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

const STRING_WIDTH_SCALE = 2.25;
const PIN_SIZE_SCALE = 1.25;

const icon = (path: string) =>
  new URL(path.replace(/^\//, ""), window.location.href).toString();

const NEEDLE_COMMANDS: PathCommand[] = [
  [Command.MOVE, -2, 9],
  [Command.LINE, -1, 20],
  [Command.LINE, 0, 23],
  [Command.LINE, 1, 20],
  [Command.LINE, 2, 9],
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

function circleCommands(radius: number): PathCommand[] {
  const control = radius * 0.5522848;
  return [
    [Command.MOVE, 0, -radius],
    [Command.CUBIC, control, -radius, radius, -control, radius, 0],
    [Command.CUBIC, radius, control, control, radius, 0, radius],
    [Command.CUBIC, -control, radius, -radius, control, -radius, 0],
    [Command.CUBIC, -radius, -control, -control, -radius, 0, -radius],
    [Command.CLOSE],
  ];
}

const SCALED_NEEDLE_COMMANDS = scalePathCommands(
  NEEDLE_COMMANDS,
  PIN_SIZE_SCALE,
);

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
  const headRadius = 16 * PIN_SIZE_SCALE;
  const baseRadius = 18 * PIN_SIZE_SCALE;

  const needleShadow = buildPath()
    .position({ x: position.x + 1, y: position.y + 2 })
    .commands(SCALED_NEEDLE_COMMANDS)
    .layer("PROP")
    .fillColor("#111215")
    .fillOpacity(0.45)
    .strokeOpacity(0)
    .name("Conspiracy pin needle shadow")
    .disableHit(true)
    .build();

  const needle = buildPath()
    .position(position)
    .commands(SCALED_NEEDLE_COMMANDS)
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
    .commands(circleCommands(baseRadius))
    .layer("PROP")
    .fillColor("#61252b")
    .strokeColor("#281518")
    .strokeWidth(1.5)
    .name("Conspiracy pin base")
    .disableHit(true)
    .build();

  const shadow = buildPath()
    .position({ x: position.x + 3, y: position.y + 4 })
    .commands(circleCommands(baseRadius))
    .layer("PROP")
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
    .commands(circleCommands(headRadius))
    .layer("PROP")
    .fillColor(strokeColor)
    .fillOpacity(1)
    .strokeColor("#f4e8d0")
    .strokeOpacity(0.95)
    .strokeWidth(Math.max(1.5, strokeWidth * 0.16))
    .name("Conspiracy pin")
    .metadata(pinMetadata)
    .build();

  const shade = buildPath()
    .position({ x: position.x + 3, y: position.y + 2 })
    .commands(circleCommands(headRadius * 0.78))
    .layer("PROP")
    .fillColor("#421b24")
    .fillOpacity(0.28)
    .strokeOpacity(0)
    .name("Conspiracy pin shading")
    .disableHit(true)
    .build();

  const highlight = buildPath()
    .position({
      x: position.x - headRadius * 0.32,
      y: position.y - headRadius * 0.32,
    })
    .commands(circleCommands(headRadius * 0.24))
    .layer("PROP")
    .fillColor("#fff6e5")
    .fillOpacity(0.45)
    .strokeOpacity(0)
    .name("Conspiracy pin highlight")
    .disableHit(true)
    .build();

  await OBR.scene.items.addItems([
    needleShadow,
    needle,
    shadow,
    base,
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
          await OBR.scene.items.updateItems(
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
        await OBR.scene.items.addItems([preview]);
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
  if (previewId) await OBR.scene.items.deleteItems([previewId]);
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
        .strokeColor("#17191d")
        .strokeOpacity(0.72)
        .strokeWidth(stringWidth + 4)
        .name("Conspiracy string shadow")
        .disableHit(true)
        .build(),
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

  await OBR.tool.create({
    id: TOOL_ID,
    icons: [{ icon: icon("/pin.svg"), label: "Conspiracy Board" }],
    defaultMode: PIN_MODE_ID,
    defaultMetadata: {
      strokeColor: DEFAULT_COLOR,
      strokeWidth: DEFAULT_WIDTH,
    },
  });

  await OBR.tool.createAction({
    id: COLOR_ACTION_ID,
    icons: [
      {
        icon: icon("/icon.svg"),
        label: "Choose pin and string color",
        filter: { activeTools: [TOOL_ID] },
      },
    ],
    onClick: async (_context, elementId) => {
      try {
        await OBR.popover.open({
          id: COLOR_POPOVER_ID,
          url: new URL("./color.html", window.location.href).toString(),
          width: 230,
          height: 218,
          anchorElementId: elementId,
          anchorReference: "ELEMENT",
          anchorOrigin: { horizontal: "CENTER", vertical: "BOTTOM" },
          transformOrigin: { horizontal: "CENTER", vertical: "TOP" },
        });
      } catch (error) {
        reportError("Could not open the board color picker.", error);
      }
    },
  });
});
