import OBR from "@owlbear-rodeo/sdk";
import { DEFAULT_COLOR, PALETTE, TOOL_ID } from "./constants";
import "./style.css";

const picker = document.querySelector<HTMLInputElement>("#color-picker");
const swatches = document.querySelector<HTMLDivElement>("#swatches");
const colorValue = document.querySelector<HTMLSpanElement>("#color-value");
const status = document.querySelector<HTMLSpanElement>("#status");

if (!picker || !swatches || !colorValue || !status) {
  throw new Error("Conspiracy Board controls could not be initialized.");
}

const colorPicker = picker;
const colorSwatches = swatches;
const selectedColorLabel = colorValue;
const statusMessage = status;

function setStatus(message: string) {
  statusMessage.textContent = message;
}

async function applyColor(color: string) {
  colorPicker.value = color;
  selectedColorLabel.textContent = color.toUpperCase();
  try {
    await OBR.tool.setMetadata(TOOL_ID, { strokeColor: color });
    setStatus("Color updated for new pins and strings");
  } catch (error) {
    console.error("Could not update the board tool color.", error);
    setStatus("Could not update color — reopen the board and try again");
  }
}

for (const color of PALETTE) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.style.setProperty("--swatch-color", color);
  button.setAttribute("aria-label", `Use ${color} for pins and strings`);
  button.addEventListener("click", () => void applyColor(color));
  colorSwatches.append(button);
}

colorPicker.addEventListener("input", () => void applyColor(colorPicker.value));

OBR.onReady(() => {
  void OBR.tool
    .getMetadata(TOOL_ID)
    .then((metadata) => {
      const selectedColor = metadata?.strokeColor;
      const color =
        typeof selectedColor === "string" &&
        /^#[\da-f]{6}$/i.test(selectedColor)
          ? selectedColor
          : DEFAULT_COLOR;
      colorPicker.value = color;
      selectedColorLabel.textContent = color.toUpperCase();
    })
    .catch((error: unknown) => {
      console.error("Could not read the board tool color.", error);
      setStatus("Could not load the current color");
    });
});
