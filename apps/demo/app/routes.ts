import { route } from "@remix-run/fetch-router";

export const routes = route({
  home: "/",
  release: "/release/:mbid",
});
