import { useRef, useState } from "react";
import type { BrandKit } from "../api";
import Popover from "./Popover";

/** Cherry Berry's palette plus neutrals. */
export const PALETTE = ["#8E1EA2", "#C654C3", "#ED96D7", "#FFC0DE", "#FFFFFF", "#F3ECF5", "#5D4E66", "#22142A", "#000000"];
const HEX = /^#?([0-9A-Fa-f]{6})$/;

function Swatches({ name, colors, current, disabled, onPick }: {
  name: string; colors: { hex: string; label: string }[]; current: string; disabled: boolean; onPick(hex: string): void;
}) {
  if (!colors.length) return null;
  return (
    <div className="ed-sw-sec">
      <h3 className="ed-ph">{name}</h3>
      <div role="group" aria-label={name} className="ed-swatches">
        {colors.map((c) => (
          <button key={c.label + c.hex} type="button" className="ed-swatch" aria-label={c.label} title={`${c.label === c.hex ? "" : `${c.label} `}${c.hex}`}
            aria-pressed={c.hex.toUpperCase() === current.toUpperCase()} disabled={disabled} style={{ background: c.hex }}
            onClick={() => onPick(c.hex.toUpperCase())} />
        ))}
      </div>
    </div>
  );
}

/**
 * A colour button opening document, brand kit and palette swatches, then the native picker and a hex field.
 * With the kit's "kit colours only" rule, only the kit's swatches. An empty colour means none (fill and stroke only).
 */
export default function ColorPopover({ label, dialog, color, disabled, kit, docColors, allowNone, onCommit }: {
  label: string; dialog: string; color: string; disabled: boolean; kit: BrandKit | null; docColors: string[]; allowNone?: boolean; onCommit(hex: string): void;
}) {
  const [hex, setHex] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cancelling = useRef(false);
  const kitColors = (kit?.content.colors ?? []).map((c) => ({ hex: c.hex, label: c.name }));
  const kitOnly = !!kit?.content.rules.kitColorsOnly && kitColors.length > 0;
  const plain = (list: string[]) => list.map((h) => ({ hex: h, label: h }));
  const pick = (h: string) => { setError(""); setHex(null); if (h !== color) onCommit(h); };
  const commitHex = () => {
    if (cancelling.current) { cancelling.current = false; setHex(null); setError(""); return; }
    if (hex === null) return;
    const m = HEX.exec(hex.trim());
    if (!m) return setError("Use six hex digits, like #8E1EA2.");
    pick(`#${m[1]!.toUpperCase()}`);
  };
  return (
    <Popover label={dialog} buttonLabel={label} title={`${label}: ${color || "none"}`} className="ed-tbb ed-tbcolor" disabled={disabled}
      onClose={() => { setHex(null); setError(""); }}
      button={<span className={`ed-chip${color ? "" : " ed-chip-none"}`} style={color ? { background: color } : undefined} aria-hidden="true" />}>
      <Swatches name="Document" colors={kitOnly ? [] : plain(docColors)} current={color} disabled={disabled} onPick={pick} />
      <Swatches name="Brand kit" colors={kitColors} current={color} disabled={disabled} onPick={pick} />
      {!kitOnly && <>
        <Swatches name="Palette" colors={plain(PALETTE)} current={color} disabled={disabled} onPick={pick} />
        <div className="ed-color">
          {/* Native "change" fires once when the picker closes: one undo step, not one per drag. */}
          <input type="color" aria-label="Custom colour" key={color} defaultValue={color || "#000000"} disabled={disabled}
            ref={(el) => {
              if (!el) return;
              const h = () => pick(el.value.toUpperCase());
              el.addEventListener("change", h);
              return () => el.removeEventListener("change", h);
            }} />
          <label className="ed-f"><b>Hex</b>
            <input aria-label="Hex" value={hex ?? color} disabled={disabled} spellCheck={false} maxLength={7} aria-invalid={!!error}
              onChange={(e) => { setHex(e.target.value); setError(""); }} onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitHex();
                if (e.key === "Escape") { cancelling.current = true; setHex(null); setError(""); }
              }} />
          </label>
        </div>
        {error && <p role="alert" className="ed-err">{error}</p>}
      </>}
      {kitOnly && <p className="muted ed-note">This brand kit allows only its own colours.</p>}
      {allowNone && <button type="button" className="ed-mini" disabled={disabled || !color} onClick={() => pick("")}>No {label.toLowerCase()}</button>}
    </Popover>
  );
}
