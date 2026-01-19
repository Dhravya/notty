import type { JSONContent } from "@tiptap/core";

export const extractTitle = (value: JSONContent | string): string => {
  let processedValue = value;

  if (typeof value === "string") {
    try {
      processedValue = JSON.parse(value);
    } catch {
      return "untitled";
    }
  }

  const contentArray = (processedValue as JSONContent).content ?? [];
  for (const contentItem of contentArray) {
    if (!contentItem.content) {
      return "untitled";
    }
    for (const innerContent of contentItem.content) {
      const text = innerContent.text ?? "";
      return text.length > 36 ? text.substring(0, 36) + "..." : text;
    }
  }
  return "untitled";
};

export const exportContentAsText = (value: JSONContent | string | unknown): string => {
  let processedValue = value;

  if (typeof value === "string") {
    try {
      processedValue = JSON.parse(value);
    } catch {
      return "";
    }
  }

  const findText = (content: JSONContent): string[] => {
    const texts: string[] = [];

    if (content.type === "text") {
      texts.push(content.text ?? "");
    }

    if (content.content && Array.isArray(content.content)) {
      for (const child of content.content) {
        texts.push(...findText(child));
      }
    }

    return texts;
  };

  const contentArray = (processedValue as JSONContent).content ?? [];
  const textArray = contentArray.flatMap(findText);

  // Skip the first line (title)
  return textArray.slice(1).join("\n");
};
