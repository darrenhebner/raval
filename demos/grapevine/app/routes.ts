import { route } from "@remix-run/fetch-router";

export const routes = route({
  home: "/",
  popular: "/popular",
  release: "/release/:mbid",
  imageProxy: "/image-proxy",
});
