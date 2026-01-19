import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { LinksFunction, MetaFunction } from "react-router";
import "./styles/globals.css";
import { NotesProvider } from "./context/NotesContext";
import { AuthProvider } from "./context/AuthContext";
import { NotesViewer } from "./components/Drawer";
import { NewNoteButton } from "./components/NewNoteButton";
import { DarkModeSwitch } from "./components/DarkModeSwitch";

export const meta: MetaFunction = () => [
  { title: "Notty - AI-Powered Notes" },
  {
    name: "description",
    content:
      "Notty is a simple, minimal AI powered note taking app and markdown editor - Built local-first, with cloud sync and real-time collaboration.",
  },
  { name: "application-name", content: "Notty" },
  { property: "og:title", content: "Notty" },
  {
    property: "og:description",
    content:
      "Notty is a simple, minimal AI powered note taking app and markdown editor - Built local-first, with cloud sync and real-time collaboration.",
  },
  { property: "og:image", content: "/ogimage.png" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:creator", content: "@dhravyashah" },
  { name: "theme-color", content: "#54CFDF" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-status-bar-style", content: "default" },
  { name: "apple-mobile-web-app-title", content: "Notty" },
];

export const links: LinksFunction = () => [
  { rel: "icon", type: "image/png", href: "/logo.png" },
  { rel: "manifest", href: "/manifest.json" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotesProvider>
        <NewNoteButton />
        <div className="fixed bottom-5 right-5 z-20 flex gap-4 md:top-5 bg-white max-h-fit rounded-lg">
          <DarkModeSwitch />
          <NotesViewer />
        </div>
        <main>
          <Outlet />
        </main>
      </NotesProvider>
    </AuthProvider>
  );
}
