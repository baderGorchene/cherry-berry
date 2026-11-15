package org.cherryberry.studio;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;

import org.junit.Test;

public class SafeNameTest {

    @Test
    public void keepsExportsInsideTheCacheDir() {
        assertEquals("poster ü.png", MainActivity.safeName("poster ü.png"));
        assertEquals("x.png", MainActivity.safeName("../../x.png"));
        assertEquals("x.png", MainActivity.safeName("..\\x.png"));
        assertEquals("a_b.pdf", MainActivity.safeName("a\nb.pdf"));
        assertEquals("export", MainActivity.safeName(".."));
        assertEquals("export", MainActivity.safeName(""));
        String longName = MainActivity.safeName("a".repeat(300) + ".png");
        assertEquals(200, longName.length());
        assertEquals(true, longName.endsWith(".png"));
    }

    @Test
    public void capsMultibyteNamesByBytesWithoutSplittingCharacters() {
        for (String unit : new String[] { "日", "😀" }) {
            String name = MainActivity.safeName(unit.repeat(300) + ".png");
            byte[] bytes = name.getBytes(StandardCharsets.UTF_8);
            assertTrue(name, bytes.length <= 200 && bytes.length > 190);
            assertTrue(name, name.matches("(" + unit + ")+\\.png"));
            assertEquals(name, new String(bytes, StandardCharsets.UTF_8)); // no split surrogate pair
        }
    }
}
