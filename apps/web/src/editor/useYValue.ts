import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";

/** Re-reads `read()` after every transaction on `ydoc`. */
export function useYValue<T>(ydoc: Y.Doc, read: () => T): T {
  const [value, setValue] = useState<{ v: T }>(() => ({ v: read() }));
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    const update = () => setValue({ v: readRef.current() });
    update();
    ydoc.on("afterTransaction", update);
    return () => ydoc.off("afterTransaction", update);
  }, [ydoc]);
  return value.v;
}
