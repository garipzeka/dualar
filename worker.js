import dualarData from "./dualar.json";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/dualar.json") {
      return new Response(JSON.stringify(dualarData, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=60, s-maxage=60"
        }
      });
    }
    return new Response("Not Found", { status: 404 });
  }
};
