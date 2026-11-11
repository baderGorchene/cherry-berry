import { useRef } from "react";
import { PT_PX, type CherryNode } from "@cherry/doc";

type TextNode = Extract<CherryNode, { kind: "text" }>;

/**
 * Textarea laid over a text node on the canvas. `origin` is the page's top-left on screen and
 * `scale` is screen px per page unit. Escape, blur and Control+Enter commit once.
 */
export default function TextEditor({ node, origin, scale, zoom, onCommit }: {
  node: TextNode; origin: { x: number; y: number }; scale: number; zoom: number; onCommit(text: string): void;
}) {
  const done = useRef(false);
  const commit = (text: string) => {
    if (done.current) return;
    done.current = true;
    onCommit(text);
  };
  const fit = (el: HTMLTextAreaElement) => { el.style.height = "0"; el.style.height = `${el.scrollHeight}px`; };
  const w = node.width * scale, h = node.height * scale;
  return (
    <textarea aria-label="Edit text" className="ed-text" defaultValue={node.text} spellCheck={false}
      ref={(el) => { if (el && !done.current && document.activeElement !== el) { fit(el); el.focus(); el.select(); } }}
      onInput={(e) => fit(e.currentTarget)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commit(e.currentTarget.value); }
      }}
      style={{
        left: origin.x + node.x * scale, top: origin.y + node.y * scale, width: w,
        transform: `rotate(${node.rotation}deg)`, transformOrigin: `${w / 2}px ${h / 2}px`,
        fontFamily: node.fontFamily, fontWeight: node.fontWeight, fontSize: node.fontSize * PT_PX * zoom,
        lineHeight: node.lineHeight, letterSpacing: node.letterSpacing * scale, textAlign: node.align,
        color: node.fill?.color ?? "#000000",
      }} />
  );
}
