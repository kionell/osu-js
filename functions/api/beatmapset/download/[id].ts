export const onRequestGet: PagesFunction = async ({ params }) => {
  let id: number = Number(params.id as string);

  const res = await fetch(`https://beatconnect.io/b/${id}/`);
  if (res.status == 200) {
    return new Response(res.body);
  } else if (res.status == 404) {
    return new Response("No beatmapset found", {
      status: 404,
    });
  } else {
    return new Response(`Error fetching beatmap: got code ${res.status}`, {
      status: 500,
    });
  }
};