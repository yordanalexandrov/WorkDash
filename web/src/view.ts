// Which view the page shows lives in the URL: `?view=table` for the table, no parameter for the board.

export type View = "board" | "table";

/** The view a URL's query asks for; anything but `view=table` is the board. */
export function readView(search: string): View {
  return new URLSearchParams(search).get("view") === "table" ? "table" : "board";
}

/** The URL with the view in it; the board drops the parameter, every other one stays. */
export function writeView(url: string, view: View): string {
  const next = new URL(url);
  if (view === "table") next.searchParams.set("view", "table");
  else next.searchParams.delete("view");
  return next.href;
}
