import type { ReactNode } from "react";
import * as Y from "yjs";
import { addPage, movePage, removePage, renamePage, type Page } from "@cherry/doc";
import type { Role } from "../api";
import { hasBrandLock } from "./brandLock";
import { IconCopy, IconDown, IconPlus, IconTrash, IconUp } from "../icons";

/** The strip above the canvas: the current page's name (editable) and its page actions. */
export default function PageHeader({ ydoc, pages, page, readOnly, role, act, onSwitch }: {
  ydoc: Y.Doc; pages: Page[]; page: Page; readOnly: boolean; role: Role; act(fn: () => void): void; onSwitch(pageId: string): void;
}) {
  const i = pages.findIndex((p) => p.id === page.id);
  const add = (opts: { after: string; copyOf?: string; keepLocks?: boolean }) => {
    let id = "";
    act(() => { id = addPage(ydoc, opts); });
    onSwitch(id);
  };
  const locked = role === "editor" && hasBrandLock(page.nodes);
  const btn = (label: string, icon: ReactNode, disabled: boolean, onClick: () => void, title = label) => (
    <button type="button" className="ed-icon" aria-label={label} title={title} disabled={readOnly || disabled} onClick={onClick}>{icon}</button>
  );
  return (
    <div className="ed-phead">
      <input className="ed-pname" aria-label="Page name" key={page.id + page.name} defaultValue={page.name} disabled={readOnly} maxLength={80}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v && v !== page.name) act(() => renamePage(ydoc, page.id, v));
          else e.currentTarget.value = page.name;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { e.currentTarget.value = page.name; e.currentTarget.blur(); }
        }} />
      <span className="muted ed-pdim">{page.width} × {page.height} {page.unit}</span>
      {btn("Move page up", <IconUp />, i <= 0, () => act(() => movePage(ydoc, page.id, i - 1)))}
      {btn("Move page down", <IconDown />, i === pages.length - 1, () => act(() => movePage(ydoc, page.id, i + 1)))}
      {btn("Duplicate page", <IconCopy />, false, () => add({ after: page.id, copyOf: page.id, keepLocks: role !== "editor" }))}
      {btn("Delete page", <IconTrash />, pages.length === 1 || locked, () => act(() => removePage(ydoc, page.id)),
        locked ? "Contains brand-locked layers" : "Delete page")}
      {btn("Add page", <IconPlus />, false, () => add({ after: page.id }))}
    </div>
  );
}
