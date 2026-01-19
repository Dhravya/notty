import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("note", "routes/note.tsx"),
  route("note/new", "routes/note-new.tsx"),
] satisfies RouteConfig;
