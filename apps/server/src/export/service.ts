import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { creditsText, usedAssetIds, yToDoc, type CherryDocument, type ExportAsset, type ExportBody } from "@cherry/doc";
import { getAssetRow } from "../assets/service";
import { getFontFile, getKit } from "../brand/service";
import type { Collab } from "../collab/server";
import type { Db } from "../db/client";
import { designs } from "../db/schema";
import { loadWithRole } from "../designs/service";
import { HttpError } from "../errors";
import type { Storage } from "../storage";
import { WorkspaceError } from "../workspaces/errors";
import { rasterOk, rasterSize, writeGif, writePdf, writePptx, writeRaster, writeSvg, type Out } from "./formats";
import { availableFamilies, useKitFonts } from "./fonts";
import { loadImages } from "./render";

const MAX_PAGES = 100;

/** The live document when someone has it open, else the stored row: an export always shows the latest edit. */
async function currentDoc(db: Db, collab: Collab, id: string): Promise<CherryDocument> {
  const live = collab.liveState(id);
  const [row] = live ? [{ state: live }] : await db.select({ state: designs.state }).from(designs).where(eq(designs.id, id));
  if (!row) throw new WorkspaceError("not_found");
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, row.state);
  const parsed = yToDoc(ydoc);
  if (!parsed.ok) throw new HttpError(400, "invalid_document");
  return parsed.doc;
}

const UNAVAILABLE = { title: "Unavailable visual", license: "cc0", attribution: "", width: 0, height: 0, kind: "image", available: false } as const;

/**
 * One entry per id. Unknown, foreign or unreadable ids get a neutral entry (nothing from the row leaks) and no file key,
 * so their bytes are never fetched.
 */
async function resolveAssets(db: Db, userId: string, ids: string[]): Promise<{ info: ExportAsset; key: string | null }[]> {
  // ponytail: one query pair per visual; batch when designs carry hundreds of distinct visuals.
  return Promise.all(ids.map(async (id) => {
    const row = await getAssetRow(db, userId, id);
    if (!row) return { info: { id, ...UNAVAILABLE }, key: null };
    return {
      info: { id, title: row.title, license: row.license as ExportAsset["license"], attribution: row.attribution,
        width: row.width, height: row.height, kind: row.kind as ExportAsset["kind"], available: true },
      key: `files/${row.sha256}`,
    };
  }));
}

async function kitFonts(db: Db, userId: string, kitId: string | null) {
  return kitId ? (await getKit(db, userId, kitId)).fonts : [];
}

export async function exportInfo(db: Db, _storage: Storage, collab: Collab, userId: string, designId: string): Promise<{ fonts: string[]; assets: ExportAsset[] }> {
  const { design } = await loadWithRole(db, designId, userId);
  const doc = await currentDoc(db, collab, design.id);
  const assets = await resolveAssets(db, userId, usedAssetIds(doc.pages));
  const fonts = availableFamilies((await kitFonts(db, userId, design.kitId)).map((f) => f.family));
  return { fonts, assets: assets.map((a) => a.info) };
}

/**
 * Title trimmed, characters unsafe in file names (and lone surrogates) replaced by "-", at most 100 code points
 * (never splitting a surrogate pair), "design" when empty.
 */
export const fileBase = (title: string) => [...title.trim()
  .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "-")]
  .slice(0, 100).join("") || "design";

export async function exportDesign(
  db: Db, storage: Storage, collab: Collab, userId: string, designId: string, body: ExportBody,
): Promise<Out & { filename: string }> {
  const { design } = await loadWithRole(db, designId, userId);
  const doc = await currentDoc(db, collab, design.id);
  if (body.pageIds.length > MAX_PAGES) throw new HttpError(400, "export_too_large");
  const wanted = new Set(body.pageIds);
  const pages = doc.pages.filter((p) => wanted.has(p.id));
  if (pages.length !== wanted.size) throw new HttpError(400, "invalid_pages");
  const scale = body.scale ?? 1;
  if (["png", "jpg", "gif"].includes(body.format) && !pages.every((p) => rasterOk(rasterSize(p, scale)))) {
    throw new HttpError(400, "export_too_large");
  }

  // This design's kit families map to private font families, for this export only; a font that can't be read is skipped.
  const fonts = await useKitFonts((await kitFonts(db, userId, design.kitId)).map((f) => ({
    id: f.id, kitId: f.kitId, family: f.family, format: f.format, bytes: async () => (await getFontFile(db, storage, userId, f.id)).bytes,
  })));

  const assets = await resolveAssets(db, userId, usedAssetIds(pages));
  const byId = new Map(assets.map((a) => [a.info.id, a]));
  // A storage failure for a readable visual propagates (a server error), it is never silently drawn as a placeholder.
  const images = await loadImages([...byId.keys()], async (id) => {
    const key = byId.get(id)?.key;
    return key ? storage.get(key) : null;
  });

  const base = fileBase(doc.title);
  let out: Out;
  switch (body.format) {
    case "pdf": out = await writePdf(pages, images, false, false, fonts); break;
    case "pdf-print": out = await writePdf(pages, images, true, body.cropMarks ?? true, fonts); break;
    case "png": case "jpg": out = await writeRaster(pages, images, body.format, scale, body.transparent ?? false, base, fonts); break;
    case "svg": out = await writeSvg(pages, images, base, fonts); break;
    case "gif": out = await writeGif(pages, images, scale, body.secondsPerPage ?? 2, fonts); break;
    case "pptx": out = await writePptx(pages, images,
      pages.map((p) => creditsText(usedAssetIds([p]).map((id) => byId.get(id)!.info))), fonts); break;
  }
  return { ...out, filename: `${base}.${out.ext}` };
}
