import { describe, test, expect } from "bun:test";
import { generateDanmakuXml } from "../../src/core/danmaku/xml-generator.ts";
import type { DandanplayComment } from "../../src/core/danmaku/types.ts";

describe("generateDanmakuXml", () => {
  test("generates valid XML for normal comments", () => {
    const comments: DandanplayComment[] = [
      { cid: 1001, p: "10.5,1,16777215,user1", m: "Hello World" },
      { cid: 1002, p: "20.0,4,255,user2", m: "Nice!" },
    ];

    const xml = generateDanmakuXml(50001, comments);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<chatserver>api.dandanplay.net</chatserver>");
    expect(xml).toContain("<chatid>50001</chatid>");
    expect(xml).toContain('<d p="10.5,1,25,16777215,0,0,user1,1001">Hello World</d>');
    expect(xml).toContain('<d p="20.0,4,25,255,0,0,user2,1002">Nice!</d>');
    expect(xml).toContain("</i>");
  });

  test("produces valid XML with zero comments", () => {
    const xml = generateDanmakuXml(99999, []);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<chatid>99999</chatid>");
    expect(xml).not.toContain("<d ");
    expect(xml).toContain("</i>");
  });

  test("escapes XML special characters in content", () => {
    const comments: DandanplayComment[] = [
      { cid: 2001, p: "5.0,1,16777215,user3", m: '<script>alert("xss")</script>' },
      { cid: 2002, p: "6.0,1,16777215,user4", m: "A & B > C" },
    ];

    const xml = generateDanmakuXml(60001, comments);

    expect(xml).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(xml).toContain("A &amp; B &gt; C");
    expect(xml).not.toContain("<script>");
  });

  test("p-field mapping: DanDanPlay 4-field to bilibili 8-field", () => {
    const comments: DandanplayComment[] = [
      { cid: 3001, p: "100.25,5,65280,myUser", m: "test" },
    ];

    const xml = generateDanmakuXml(70001, comments);

    // Expected: time=100.25, mode=5, fontSize=25, color=65280, timestamp=0, pool=0, userId=myUser, cid=3001
    expect(xml).toContain('<d p="100.25,5,25,65280,0,0,myUser,3001">test</d>');
  });

  test("handles comments with single quotes", () => {
    const comments: DandanplayComment[] = [
      { cid: 4001, p: "1.0,1,16777215,u1", m: "It's great" },
    ];

    const xml = generateDanmakuXml(80001, comments);
    expect(xml).toContain("It&apos;s great");
  });
});
