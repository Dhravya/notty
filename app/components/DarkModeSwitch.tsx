import { useEffect, useState } from "react";

export function DarkModeSwitch() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Dynamically import darkreader to avoid SSR issues
    const initDarkMode = async () => {
      const {
        enable: enableDarkMode,
        disable: disableDarkMode,
        auto: followSystemColorScheme,
        isEnabled: isDarkReaderEnabled,
      } = await import("darkreader");

      followSystemColorScheme({
        sepia: 10,
      });

      if (isDarkReaderEnabled()) {
        setIsDark(true);
      }

      // Store references for later use
      (window as unknown as { _darkReader: typeof import("darkreader") })._darkReader = {
        enable: enableDarkMode,
        disable: disableDarkMode,
        auto: followSystemColorScheme,
        isEnabled: isDarkReaderEnabled,
      } as unknown as typeof import("darkreader");
    };

    initDarkMode();
  }, []);

  const toggleDarkMode = async () => {
    const darkReader = (window as unknown as { _darkReader?: { enable: (config: { sepia: number }) => void; disable: () => void; isEnabled: () => boolean } })._darkReader;
    if (!darkReader) return;

    if (!darkReader.isEnabled()) {
      darkReader.enable({
        sepia: 10,
      });
      setIsDark(true);
    } else {
      darkReader.disable();
      setIsDark(false);
    }
  };

  if (!mounted) {
    return (
      <button className="flex items-center p-2 rounded-md cursor-pointer bg-slate-200">
        <div className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      className="flex items-center p-2 rounded-md cursor-pointer bg-slate-200 dark:text-white dark:bg-slate-700"
      onClick={toggleDarkMode}
    >
      {isDark ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
