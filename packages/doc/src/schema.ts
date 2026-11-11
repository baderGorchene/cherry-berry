import { z } from "zod";

export const CHERRY_FORMAT_VERSION = 1;

export const Unit = z.enum(["px", "mm", "in"]);
export const ColorMode = z.enum(["rgb", "cmyk"]);

export const Paint = z.object({
  type: z.literal("solid"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  opacity: z.number().min(0).max(1).default(1),
});
export type Paint = z.infer<typeof Paint>;

export const Stroke = z.object({ paint: Paint, width: z.number().min(0) });
export type Stroke = z.infer<typeof Stroke>;

const base = {
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
};

const RectNode = z.object({
  ...base, kind: z.literal("rect"),
  fill: Paint.optional(), stroke: Stroke.optional(), cornerRadius: z.number().min(0).default(0),
});
const EllipseNode = z.object({ ...base, kind: z.literal("ellipse"), fill: Paint.optional(), stroke: Stroke.optional() });
const PathNode = z.object({
  ...base, kind: z.literal("path"), d: z.string(),
  fill: Paint.optional(), stroke: Stroke.optional(), fillRule: z.enum(["nonzero", "evenodd"]).default("nonzero"),
});
const TextNode = z.object({
  ...base, kind: z.literal("text"), text: z.string(), fontFamily: z.string(), fontSize: z.number().positive(),
  fontWeight: z.number().default(400), lineHeight: z.number().default(1.2), letterSpacing: z.number().default(0),
  align: z.enum(["left", "center", "right"]).default("left"), fill: Paint.optional(),
});
const ImageNode = z.object({ ...base, kind: z.literal("image"), assetId: z.string() });

export type CherryNode =
  | z.infer<typeof RectNode> | z.infer<typeof EllipseNode> | z.infer<typeof PathNode>
  | z.infer<typeof TextNode> | z.infer<typeof ImageNode>
  | (z.infer<z.ZodObject<typeof base>> & { kind: "group"; children: CherryNode[] });

const GroupNode = z.object({
  ...base, kind: z.literal("group"),
  get children(): z.ZodArray<z.ZodType<CherryNode>> { return z.array(CherryNode); },
});

export const CherryNode: z.ZodType<CherryNode> = z.discriminatedUnion("kind", [
  RectNode, EllipseNode, PathNode, TextNode, ImageNode, GroupNode,
]) as z.ZodType<CherryNode>;

export const Page = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: Unit,
  colorMode: ColorMode,
  bleed: z.number().min(0).default(0),
  background: Paint,
  nodes: z.array(CherryNode),
});
export type Page = z.infer<typeof Page>;

export const CherryDocument = z.object({
  format: z.literal("cherry"),
  version: z.number().int(),
  id: z.string(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  pages: z.array(Page).min(1),
});
export type CherryDocument = z.infer<typeof CherryDocument>;
