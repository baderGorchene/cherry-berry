/** Clicked links to other http(s) origins open in a new browsing context: the desktop shell sends those to the system browser. */
export function openOffOriginLinksOutside(doc: Document = document, origin = location.origin) {
  doc.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a) return;
      const url = new URL(a.href);
      if (!/^https?:$/.test(url.protocol) || url.origin === origin) return;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    },
    true,
  );
}
