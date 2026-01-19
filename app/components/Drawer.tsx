import { useEffect, useRef } from "react";
import { Drawer } from "vaul";
import autoAnimate from "@formkit/auto-animate";
import { useAuth } from "../context/AuthContext";
import { useNotes } from "../context/NotesContext";

const ResponsiveDrawer = ({ children }: { children: React.ReactNode }) => (
  <div className="z-10">
    <div className="md:hidden">
      <Drawer.Root shouldScaleBackground direction="bottom">
        {children}
      </Drawer.Root>
    </div>
    <div className="hidden md:block">
      <Drawer.Root shouldScaleBackground direction="right">
        {children}
      </Drawer.Root>
    </div>
  </div>
);

export function NotesViewer() {
  const { user, signIn, signOut } = useAuth();
  const { notes, deleteNote, loading } = useNotes();
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    parent.current && autoAnimate(parent.current);
  }, [parent]);

  return (
    <ResponsiveDrawer>
      <Drawer.Trigger
        className="flex items-center justify-center gap-2 rounded-lg border p-2 transition-colors duration-200 hover:bg-stone-100 active:bg-stone-200 sm:bottom-auto sm:top-5 dark:border-gray-700 dark:hover:bg-gray-800"
        asChild
      >
        <button className="bg-white dark:bg-gray-900 dark:text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-6 w-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
            />
          </svg>
          Menu
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-30" />
        <Drawer.Content className="fixed bottom-0 right-0 z-40 mt-24 flex h-[96%] w-full flex-col rounded-t-[10px] bg-white dark:bg-gray-900 md:h-full md:w-[400px]">
          <div className="flex h-screen flex-col rounded-t-[10px] md:flex-row">
            <div className="mx-auto mb-8 mt-4 h-1.5 w-12 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-gray-600 md:my-auto md:ml-4 md:h-12 md:w-1.5" />
            <div className="mb-24 flex-1 overflow-auto bg-white dark:bg-gray-900 p-4 md:mb-10">
              {user?.email ? (
                <div className="absolute bottom-16 flex justify-between w-full pr-20 bg-white dark:bg-gray-900">
                  <div className="flex items-center gap-2 mb-4">
                    {user.image && (
                      <img
                        src={user.image}
                        alt="profile"
                        className="h-10 w-10 rounded-full"
                        width={40}
                        height={40}
                      />
                    )}
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                      <p className="font-semibold dark:text-white">{user.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={signOut}
                    className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="absolute bottom-16 flex justify-center w-full pr-20 bg-white dark:bg-gray-900">
                  <button
                    className="w-full bg-sky-100 dark:bg-sky-900 rounded-lg p-4 flex gap-4 items-center justify-center dark:text-white"
                    onClick={signIn}
                  >
                    <img src="/google.svg" alt="google" width={24} height={24} />
                    Login with Google
                  </button>
                </div>
              )}

              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 bg-stone-100 dark:bg-gray-800 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="mx-auto max-w-md">
                  <Drawer.Title className="mb-4 font-medium dark:text-white">Your notes</Drawer.Title>
                  <div ref={parent} className="flex flex-col gap-2">
                    {notes.length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400 text-sm">
                        No notes yet. Create your first note!
                      </p>
                    ) : (
                      notes.map(([key, value]) => (
                        <div className="flex gap-2 group" key={key}>
                          <a
                            href={`/note?id=${key}`}
                            className="flex-1 rounded-md p-2 hover:bg-stone-100 dark:hover:bg-gray-800 active:bg-stone-200 dark:active:bg-gray-700 transition-colors"
                          >
                            <span className="font-medium text-gray-900 dark:text-white block truncate">
                              {value?.title || "Untitled"}
                            </span>
                            {value?.preview && (
                              <span className="text-sm text-gray-500 dark:text-gray-400 block truncate">
                                {value.preview}
                              </span>
                            )}
                          </a>
                          <button
                            className="flex h-10 w-10 items-center justify-center rounded-md p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            onClick={async () => {
                              await deleteNote(key);
                            }}
                            title="Delete note"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 16 16"
                              fill="currentColor"
                              className="h-4 w-4"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-0 mt-auto flex w-full justify-between border-t border-zinc-200 dark:border-gray-700 bg-zinc-100 dark:bg-gray-800 p-4">
            <div className="gap-1 flex items-center text-xs text-zinc-600 dark:text-gray-400">
              Made with love by{" "}
              <a className="text-sky-500" href="https://dhravya.dev">
                Dhravya Shah
              </a>
            </div>
            <div className="flex max-w-md gap-6">
              <a
                className="gap-0.25 flex items-center text-xs text-zinc-600 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white"
                href="https://github.com/dhravya/notty"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
                <svg
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                  aria-hidden="true"
                  className="ml-1 h-3 w-3"
                >
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path>
                  <path d="M15 3h6v6"></path>
                  <path d="M10 14L21 3"></path>
                </svg>
              </a>
              <a
                className="gap-0.25 flex items-center text-xs text-zinc-600 dark:text-gray-400 hover:text-zinc-900 dark:hover:text-white"
                href="https://twitter.com/dhravyashah"
                target="_blank"
                rel="noopener noreferrer"
              >
                Twitter
                <svg
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                  aria-hidden="true"
                  className="ml-1 h-3 w-3"
                >
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"></path>
                  <path d="M15 3h6v6"></path>
                  <path d="M10 14L21 3"></path>
                </svg>
              </a>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </ResponsiveDrawer>
  );
}
