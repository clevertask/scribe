import { gitHubEmojis, type EmojiItem } from "@tiptap/extension-emoji";
import { describe, expect, it } from "vitest";

import { getEmojiSuggestions } from "../lib/components/Scribe/extension/emoji/items";

const emoji = (name: string, shortcodes: string[] = [name], tags: string[] = []): EmojiItem => ({
  name,
  shortcodes,
  tags,
});

describe("Emoji search", () => {
  it("puts the exact shortcode first while exposing the other mag matches", () => {
    const results = getEmojiSuggestions(gitHubEmojis, "mag");

    expect(results).toHaveLength(16);
    expect(results[0]).toBe(gitHubEmojis.find(({ name }) => name === "mag"));
    expect(results[0].emoji).toBe("🔍");
  });

  it("limits a search to 17 results after ranking the complete set", () => {
    const partialMatches = Array.from({ length: 25 }, (_, index) => emoji(`mag_${index}`));
    const exactMatch = emoji("mag");
    const results = getEmojiSuggestions([...partialMatches, exactMatch], "mag");

    expect(results).toHaveLength(17);
    expect(results[0]).toBe(exactMatch);
    expect(results.slice(1)).toEqual(partialMatches.slice(0, 16));
  });

  it.each(["magnifying", "search", "sear"])("finds magnifying glasses with %s", (query) => {
    expect(
      getEmojiSuggestions(gitHubEmojis, query)
        .slice(0, 2)
        .map(({ name }) => name),
    ).toEqual(["mag", "mag_right"]);
  });

  it("searches the displayed name even when it is absent from the shortcode aliases", () => {
    const item = gitHubEmojis.find(({ name }) => name === "hugs")!;

    expect(item.shortcodes).not.toContain("hugs");
    expect(getEmojiSuggestions(gitHubEmojis, "hugs")[0]).toBe(item);
  });

  it("ranks exact names and aliases, exact keywords, prefixes, then other partial matches", () => {
    const items = [
      emoji("other_partial", ["a_looking_glass"], ["research"]),
      emoji("keyword_prefix", [], ["searching"]),
      emoji("searching"),
      emoji("keyword_exact", [], ["search"]),
      emoji("alias_exact", ["search"]),
      emoji("search"),
    ];

    expect(getEmojiSuggestions(items, "search").map(({ name }) => name)).toEqual([
      "alias_exact",
      "search",
      "keyword_exact",
      "searching",
      "keyword_prefix",
      "other_partial",
    ]);
  });

  it("matches partial names, aliases and keywords case-insensitively", () => {
    const items = [
      emoji("a_Needle_name", [], []),
      emoji("alias", ["a_NEEDLE_alias"], []),
      emoji("keyword", [], ["a_needle_keyword"]),
    ];

    expect(getEmojiSuggestions(items, "nEeDlE")).toEqual(items);
    expect(getEmojiSuggestions(gitHubEmojis, "MAG")[0].name).toBe("mag");
  });

  it("keeps the original objects and dataset order for ties without mutating the dataset", () => {
    const items = Object.freeze([
      emoji("first", [], ["find"]),
      emoji("second", [], ["find"]),
      emoji("third", [], ["find"]),
    ]);

    const results = getEmojiSuggestions(items, "find");

    expect(results).toEqual(items);
    results.forEach((item, index) => expect(item).toBe(items[index]));
  });

  it("keeps the first five suggestions for an empty query and returns no unrelated matches", () => {
    expect(getEmojiSuggestions(gitHubEmojis, "")).toEqual(gitHubEmojis.slice(0, 5));
    expect(getEmojiSuggestions(gitHubEmojis, "no_such_emoji_keyword")).toEqual([]);
    expect(getEmojiSuggestions([], "mag")).toEqual([]);
  });
});
