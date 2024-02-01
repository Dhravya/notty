"use client";

/**
 * v0 by Vercel.
 * @see https://v0.dev/t/RvBL7CWvezj
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
import { Button } from "@/components/ui/button";

export default function Warning({
  handleKeepLocalStorage,
  handleKeepCloudStorage,
}: {
  handleKeepLocalStorage: () => void;
  handleKeepCloudStorage: () => void;
}) {
  return (
    <div
      key="1"
      className="m-4 flex items-center gap-4 rounded-lg bg-white p-6 shadow-md"
    >
      <AlertTriangleIcon className="hidden h-6 w-6 text-yellow-500 md:block" />
      <div className="flex-grow">
        <h2 className="text-xl font-bold">Warning</h2>
        <p>
          This note was fetched from local storage, it may not be the latest
          version.
        </p>
      </div>
      <div className="flex flex-col justify-end gap-4 md:flex-row">
        <Button
          onClick={handleKeepLocalStorage}
          className="border-blue-500 text-blue-500"
          variant="outline"
        >
          Keep Local Storage
        </Button>
        <Button
          onClick={handleKeepCloudStorage}
          className="border-blue-500 text-blue-500"
          variant="outline"
        >
          Keep Cloud
        </Button>
      </div>
    </div>
  );
}

function AlertTriangleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
