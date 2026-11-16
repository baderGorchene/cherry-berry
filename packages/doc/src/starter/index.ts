import type { CherryDocument } from "../schema";
import brandKickoff from "./brand-kickoff";
import jazzNightFlyer from "./jazz-night-flyer";
import saturdayMarket from "./saturday-market";
import weddingInvitation from "./wedding-invitation";

export type StarterCategory = "social" | "presentation" | "print" | "cards";
export type StarterTemplate = { id: string; name: string; category: StarterCategory; doc: CherryDocument };

const entry = (category: StarterCategory, doc: CherryDocument): StarterTemplate => ({ id: doc.id, name: doc.title, category, doc });

/** Built-in starter designs: pure data, no images, catalogue fonts only. "Use" imports one as a new design (no database rows). */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  entry("social", saturdayMarket),
  entry("presentation", brandKickoff),
  entry("print", jazzNightFlyer),
  entry("cards", weddingInvitation),
];
