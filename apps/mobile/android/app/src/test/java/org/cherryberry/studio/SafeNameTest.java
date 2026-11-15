package org.cherryberry.studio;

import static org.junit.Assert.assertEquals;

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
        assertEquals(120, longName.length());
        assertEquals(true, longName.endsWith(".png"));
    }
}
