import type { JSONContent } from "@tiptap/core";

export type NoteValue = JSONContent;

export interface Note {
  id: string;
  content: NoteValue;
  createdAt?: number;
  updatedAt?: number;
}

export interface NoteListItem {
  key: string;
  value: NoteValue;
}
