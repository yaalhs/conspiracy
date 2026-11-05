import OBR from "@owlbear-rodeo/sdk";
import {
  COLOR_POPOVER_ID,
  DEFAULT_COLOR,
  DRAW_TOOL_ID,
  EXTENSION_ID,
  PALETTE,
} from "./constants";
import "./style.css";

const swatches = document.querySelector<HTMLDivElement>("#swatches");
const status = document.querySelector<HTMLSpanElement>("#status");

if (!swatches || !status) {
  throw new Error("Conspiracy Board color controls could not be initialized.");
}

const colorSwatches = swatches;
const statusMessage = status;

function setStatus(message: string) {
  statusMessage.textContent = message;
}

async function applyColor(color: string, closeAfterSelection = false) {
  let selectedSwatch = false;
  colorSwatches
    .querySelectorAll<HTMLButtonElement>(".swatch")
    .forEach((button) => {
      const selected =
        button.style.getPropertyValue("--swatch-color") === color;
      button.setAttribute("aria-pressed", String(selected));
      selectedSwatch ||= selected;
    });
  customButton.setAttribute("aria-pressed", String(!selectedSwatch));
  try {
    await OBR.tool.setMetadata(DRAW_TOOL_ID, {
      [EXTENSION_ID]: { strokeColor: color },
    });
    setStatus("Color updated");
    if (closeAfterSelection) {
      await OBR.popover.close(COLOR_POPOVER_ID).catch((error: unknown) => {
        console.error("Could not close the board color picker.", error);
      });
    }
  } catch (error) {
    console.error("Could not update the board tool color.", error);
    setStatus("Could not update color — try again");
  }
}

for (const color of PALETTE) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swatch";
  button.style.setProperty("--swatch-color", color);
  button.setAttribute("aria-label", `Use ${color} for pins and strings`);
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => void applyColor(color, true));
  colorSwatches.append(button);
}

const customButton = document.createElement("label");
customButton.className = "picker-wrap";
customButton.title = "Choose a custom color";
customButton.setAttribute("aria-label", "Choose a custom color");
customButton.setAttribute("aria-pressed", "false");
const customColorPicker = document.createElement("input");
customColorPicker.id = "custom-color-picker";
customColorPicker.type = "color";
customColorPicker.value = DEFAULT_COLOR;
customColorPicker.setAttribute("aria-label", "Choose a custom color");
const plus = document.createElement("span");
plus.setAttribute("aria-hidden", "true");
plus.textContent = "+";
customButton.append(customColorPicker, plus);
colorSwatches.append(customButton);

customColorPicker.addEventListener("change", () =>
  void applyColor(customColorPicker.value, true),
);

OBR.onReady(() => {
  void OBR.tool
    .getMetadata(DRAW_TOOL_ID)
    .then((metadata) => {
      const extensionMetadata = metadata?.[EXTENSION_ID];
      const selectedColor =
        typeof extensionMetadata === "object" &&
        extensionMetadata !== null &&
        "strokeColor" in extensionMetadata
          ? extensionMetadata.strokeColor
          : undefined;
      const color =
        typeof selectedColor === "string" &&
        /^#[\da-f]{6}$/i.test(selectedColor)
          ? selectedColor
          : DEFAULT_COLOR;
      customColorPicker.value = color;
      let selectedSwatch = false;
      colorSwatches
        .querySelectorAll<HTMLButtonElement>(".swatch")
        .forEach((button) => {
          const selected =
            button.style.getPropertyValue("--swatch-color") === color;
          button.setAttribute("aria-pressed", String(selected));
          selectedSwatch ||= selected;
        });
      customButton.setAttribute("aria-pressed", String(!selectedSwatch));
    })
    .catch((error: unknown) => {
      console.error("Could not read the current board color.", error);
      setStatus("Could not load color");
    });
});
