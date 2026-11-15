import { expect, test } from "vitest";
import { openOffOriginLinksOutside } from "./links";

type Anchor = { href: string; target: string; rel: string };
const anchor = (href: string): Anchor => ({ href, target: "", rel: "" });
const click = (a: Anchor | null) => ({ target: { closest: () => a } }) as unknown as MouseEvent;

test("off-origin links open in a new browsing context", () => {
  let handler: ((e: MouseEvent) => void) | undefined;
  openOffOriginLinksOutside({ addEventListener: (_: string, h: (e: MouseEvent) => void) => (handler = h) } as unknown as Document, "http://localhost:5173");

  const away = anchor("https://elsewhere.org/docs");
  handler!(click(away));
  expect(away).toEqual({ href: "https://elsewhere.org/docs", target: "_blank", rel: "noopener noreferrer" });

  const home = anchor("http://localhost:5173/designs/1");
  handler!(click(home));
  expect(home).toEqual({ href: "http://localhost:5173/designs/1", target: "", rel: "" });

  const mail = anchor("mailto:someone@elsewhere.org");
  handler!(click(mail));
  expect(mail.target).toBe("");

  handler!(click(null)); // clicks outside links are ignored
});
