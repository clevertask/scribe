import type { EmojiItem } from "@tiptap/extension-emoji";

const SUGGESTION_LIMIT = 5;

const getMatchRank = (item: EmojiItem, query: string) => {
  const names = [item.name, ...item.shortcodes].map((name) => name.toLowerCase());
  const tags = item.tags.map((tag) => tag.toLowerCase());

  if (names.includes(query)) {
    return 0;
  }

  if (tags.includes(query)) {
    return 1;
  }

  if (names.some((name) => name.startsWith(query))) {
    return 2;
  }

  if (tags.some((tag) => tag.startsWith(query))) {
    return 3;
  }

  if ([...names, ...tags].some((value) => value.includes(query))) {
    return 4;
  }

  return -1;
};

export const getEmojiSuggestions = (emojis: readonly EmojiItem[], query: string): EmojiItem[] => {
  if (query.length === 0) {
    return emojis.slice(0, SUGGESTION_LIMIT);
  }

  const normalizedQuery = query.toLowerCase();

  return (
    emojis
      .map((item) => ({ item, rank: getMatchRank(item, normalizedQuery) }))
      .filter(({ rank }) => rank !== -1)
      // Keep the dataset's order for equally relevant matches.
      .sort((left, right) => left.rank - right.rank)
      .slice(0, SUGGESTION_LIMIT)
      .map(({ item }) => item)
  );
};
