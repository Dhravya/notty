import { Link } from "react-router";
import { Card, CardContent } from "./ui/card";
import { useNotes } from "../context/NotesContext";
import { extractTitle } from "@shared/utils/note";
import type { SearchResponse } from "@shared/types/search";

interface SearchResultsProps {
  searchResponse: SearchResponse;
}

export function SearchResults({ searchResponse }: SearchResultsProps) {
  const { notes } = useNotes();

  const getNoteTitle = (noteId: string) => {
    if (noteId.length === 10 && noteId.match(/^\d+$/)) {
      const note = notes.find(([key]) => key === noteId);
      if (note) {
        return extractTitle(note[1]);
      }
    }
    return "Untitled";
  };

  return (
    <div
      style={{
        backgroundImage: "linear-gradient(to right, #E5D9F2, #CDC1FF)",
      }}
      className="w-full max-w-2xl mx-auto px-4 py-6 space-y-6 border mt-4 rounded-xl"
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold">{searchResponse.answer}</h2>
        <p className="text-gray-500">
          AI Search powered by{" "}
          <a className="text-sky-500" href="https://supermemory.ai">
            Supermemory
          </a>
        </p>
      </div>

      {searchResponse.results.length > 0 && (
        <div className="grid gap-6">
          {searchResponse.results.map((result, index) => (
            <Card key={index}>
              <CardContent className="space-y-2">
                <h3 className="text-lg font-semibold mt-4">
                  {result.noteId ? getNoteTitle(result.noteId) : "Related"}
                </h3>
                <p className="text-gray-500">{result.content}</p>
                {result.noteId && (
                  <div className="flex flex-col gap-2">
                    <Link
                      className="text-blue-500 hover:underline"
                      to={`/note?id=${result.noteId}`}
                    >
                      Open Note
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
