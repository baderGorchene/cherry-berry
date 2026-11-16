import type { ReactNode } from "react";
import FileMenu, { type FileItem } from "./FileMenu";
import { IconCopy, IconLock, IconMore, IconTrash, IconUnlock } from "../icons";

/** The small menu floating above the selection: Duplicate, Delete, Lock, and More (layer order, group, copy and paste, combine). */
export default function SelectionMenu({ canMove, canDelete, locked, onDuplicate, onDelete, onLock, more }: {
  canMove: boolean; canDelete: boolean; locked: boolean;
  onDuplicate(): void; onDelete(): void; onLock(): void; more: FileItem[];
}) {
  const btn = (label: string, icon: ReactNode, disabled: boolean, onClick: () => void) => (
    <button type="button" className="ed-icon" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{icon}</button>
  );
  return (
    <div role="toolbar" aria-label="Selection actions" className="ed-selmenu">
      {btn("Duplicate", <IconCopy />, !canMove, onDuplicate)}
      {canDelete && btn("Delete", <IconTrash />, false, onDelete)}
      {btn(locked ? "Unlock" : "Lock", locked ? <IconLock /> : <IconUnlock />, !canMove, onLock)}
      <FileMenu label="More" button={<IconMore />} className="ed-icon" items={more} />
    </div>
  );
}
