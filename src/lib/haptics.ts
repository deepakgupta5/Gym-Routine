export type HapticIntensity = "light" | "medium" | "heavy";

const ROOT_ID = "gym-haptic-root";
const INPUT_ID = "gym-haptic-switch";

let initialized = false;
let supported = false;
let triggerLabel: HTMLLabelElement | null = null;

function isStandaloneDisplayMode() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = nav.standalone === true;
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return standalone || mediaStandalone;
}

function supportsSwitchInput() {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  return input.getAttribute("role") === "switch";
}

export function setupHaptics() {
  if (initialized) return;
  initialized = true;

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (!isStandaloneDisplayMode() || !supportsSwitchInput()) {
    return;
  }

  const existingLabel = document.querySelector<HTMLLabelElement>(`label[for='${INPUT_ID}']`);
  if (existingLabel) {
    triggerLabel = existingLabel;
    supported = true;
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("aria-hidden", "true");
  root.style.position = "fixed";
  root.style.width = "1px";
  root.style.height = "1px";
  root.style.overflow = "hidden";
  root.style.opacity = "0";
  root.style.pointerEvents = "none";
  root.style.left = "-9999px";
  root.style.bottom = "-9999px";

  const input = document.createElement("input");
  input.id = INPUT_ID;
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.tabIndex = -1;

  const label = document.createElement("label");
  label.htmlFor = INPUT_ID;
  label.textContent = "h";

  root.appendChild(input);
  root.appendChild(label);
  document.body.appendChild(root);

  triggerLabel = label;
  supported = true;
}

export function haptic(intensity: HapticIntensity) {
  if (!supported || !triggerLabel) {
    return;
  }

  const pulses = intensity === "light" ? 1 : intensity === "medium" ? 2 : 3;

  for (let i = 0; i < pulses; i++) {
    window.setTimeout(() => {
      triggerLabel?.click();
    }, i * 28);
  }
}
