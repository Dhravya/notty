import { useSearchParams } from "react-router";
import { TiptapEditor } from "../components/TiptapEditor";

export default function NotePage() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");

  if (!id) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center">
        <p className="text-gray-500">Note not found</p>
      </div>
    );
  }

  return (
    <div className="mb-12 flex min-h-[100svh] flex-col items-center sm:px-5 sm:pt-[calc(20vh)] md:mb-0">
      <TiptapEditor id={id} />
    </div>
  );
}
