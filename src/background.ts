import OBR, { buildLine, buildShape } from "@owlbear-rodeo/sdk";
import {
  DEFAULT_COLOR,
  DEFAULT_WIDTH,
  EXTENSION_ID,
  PIN_MODE_ID,
  STRING_MODE_ID,
  TOOL_ID,
} from "./constants";

type ToolMetadata = {
  strokeColor?: string;
  strokeWidth?: number;
};

const icon = (path: string) =>
  new URL(path.replace(/^\//, ""), window.location.href).toString();
let stringStart: { x: number; y: number } | null = null;

function getStyle(metadata: Record<string, unknown>): Required<ToolMetadata> {
  const toolMetadata = metadata as ToolMetadata;
  const color = toolMetadata.strokeColor;
  const width = toolMetadata.strokeWidth;
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

async function addPin(
  metadata: Record<string, unknown>,
  position: { x: number; y: number },
) {
  const { strokeColor, strokeWidth } = getStyle(metadata);
  const pin = buildShape()
    .position(position)
    .width(36)
    .height(36)
    .shapeType("CIRCLE")
    .fillColor(strokeColor)
    .fillOpacity(1)
    .strokeColor("#f4e8d0")
    .strokeWidth(Math.max(2, strokeWidth))
    .name("Conspiracy pin")
    .metadata({ [EXTENSION_ID]: { kind: "pin" } })
    .build();
  await OBR.scene.items.addItems([pin]);
}

async function addString(
  metadata: Record<string, unknown>,
  startPosition: { x: number; y: number },
  endPosition: { x: number; y: number },
) {
  const { strokeColor, strokeWidth } = getStyle(metadata);
  const line = buildLine()
    .startPosition(startPosition)
    .endPosition(endPosition)
    .strokeColor(strokeColor)
    .strokeWidth(strokeWidth)
    .name("Conspiracy string")
    .metadata({ [EXTENSION_ID]: { kind: "string" } })
    .build();
  await OBR.scene.items.addItems([line]);
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
    onToolClick: async (context, event) => {
      if (!stringStart) {
        stringStart = event.pointerPosition;
        return;
      }

      const start = stringStart;
      stringStart = null;
      try {
        await addString(context.metadata, start, event.pointerPosition);
      } catch (error) {
        reportError("Could not draw conspiracy string.", error);
      }
    },
    onKeyDown: (_context, event) => {
      if (event.key === "Escape") stringStart = null;
    },
    onDeactivate: () => {
      stringStart = null;
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
