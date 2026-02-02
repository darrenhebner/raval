import { greeting } from "streamweaver";

export default {
  async fetch(request: Request) {
    return new Response(greeting());
  },
} satisfies ExportedHandler<Cloudflare.Env>;
