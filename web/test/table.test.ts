import { describe, expect, it } from "vitest";
import { groupItems, nextSort, sortItems, type TableColumn, toggleCollapsed } from "../src/table.js";

type Item = { name: string; size: number; updatedAt: string };

const name: TableColumn<Item> = { key: "name", label: "name", value: (item) => item.name };
const size: TableColumn<Item> = { key: "size", label: "size", value: (item) => item.size, first: -1 };

describe("nextSort", () => {
  it("turns the same column the other way", () => {
    expect(nextSort({ key: "name", dir: 1 }, name)).toEqual({ key: "name", dir: -1 });
    expect(nextSort({ key: "size", dir: -1 }, size)).toEqual({ key: "size", dir: 1 });
  });

  it("starts a new column in its natural direction, ascending unless it says otherwise", () => {
    expect(nextSort({ key: "name", dir: -1 }, size)).toEqual({ key: "size", dir: -1 });
    expect(nextSort({ key: "size", dir: -1 }, name)).toEqual({ key: "name", dir: 1 });
  });
});

const item = (n: string, s: number, updatedAt = "2026-10-30T10:00:00Z"): Item => ({ name: n, size: s, updatedAt });
const columns = [name, size, { key: "action", label: "" }];
const names = (items: Item[]) => items.map((i) => i.name);
const recent = (i: Item) => i.updatedAt;

describe("sortItems", () => {
  it("sorts by text and by number, either way", () => {
    const items = [item("b", 2), item("c", 10), item("a", 1)];
    expect(names(sortItems(items, columns, { key: "name", dir: 1 }, recent))).toEqual(["a", "b", "c"]);
    expect(names(sortItems(items, columns, { key: "name", dir: -1 }, recent))).toEqual(["c", "b", "a"]);
    expect(names(sortItems(items, columns, { key: "size", dir: 1 }, recent))).toEqual(["a", "b", "c"]);
    expect(names(sortItems(items, columns, { key: "size", dir: -1 }, recent))).toEqual(["c", "b", "a"]);
  });

  it("puts the more recently active item first on a tie, whichever way the column goes", () => {
    const old = item("old", 1, "2026-10-01T10:00:00Z");
    const fresh = item("fresh", 1, "2026-10-30T10:00:00Z");
    expect(names(sortItems([old, fresh], columns, { key: "size", dir: 1 }, recent))).toEqual(["fresh", "old"]);
    expect(names(sortItems([old, fresh], columns, { key: "size", dir: -1 }, recent))).toEqual(["fresh", "old"]);
  });

  it("keeps the given order of items that tie on everything, and leaves the input alone", () => {
    const items = [item("x", 1), item("y", 1), item("z", 1)];
    expect(names(sortItems(items, columns, { key: "size", dir: 1 }, recent))).toEqual(["x", "y", "z"]);
    expect(names(sortItems(items, columns, { key: "size", dir: -1 }, recent))).toEqual(["x", "y", "z"]);
    sortItems(items, columns, { key: "name", dir: -1 }, recent);
    expect(names(items)).toEqual(["x", "y", "z"]);
  });

  it("puts an item without a value last when ascending", () => {
    const tag: TableColumn<Item> = { key: "tag", label: "tag", value: (i) => (i.name === "none" ? undefined : i.name) };
    const items = [item("none", 0), item("y", 0), item("x", 0)];
    expect(names(sortItems(items, [tag], { key: "tag", dir: 1 }, recent))).toEqual(["x", "y", "none"]);
    expect(names(sortItems(items, [tag], { key: "tag", dir: -1 }, recent))).toEqual(["none", "y", "x"]);
  });

  it("leaves the order as it is for a column that does not sort or is unknown", () => {
    const items = [item("b", 2), item("a", 1)];
    expect(names(sortItems(items, columns, { key: "action", dir: 1 }, recent))).toEqual(["b", "a"]);
    expect(names(sortItems(items, columns, { key: "gone", dir: 1 }, recent))).toEqual(["b", "a"]);
  });
});

type Task = { title: string; owner: string; stage: "todo" | "doing" | "done" };
const task = (title: string, owner: string, stage: Task["stage"]): Task => ({ title, owner, stage });
const STAGES = ["todo", "doing", "done"];
const tasks = [task("t1", "zed", "done"), task("t2", "amy", "todo"), task("t3", "zed", "todo"), task("t4", "bob", "doing")];
const keyOf = (t: Task, by: string) => (by === "stage" ? t.stage : t.owner);
const titles = (items: Task[]) => items.map((t) => t.title);

describe("groupItems", () => {
  it("makes one group of everything when grouping by nothing", () => {
    const groups = groupItems(tasks, "none", keyOf);
    expect(groups.map((g) => [g.id, titles(g.items)])).toEqual([["none:", ["t1", "t2", "t3", "t4"]]]);
  });

  it("orders the groups by name, keeping the items' order inside each", () => {
    const groups = groupItems(tasks, "owner", keyOf);
    expect(groups.map((g) => [g.id, g.key, titles(g.items)])).toEqual([
      ["owner:amy", "amy", ["t2"]],
      ["owner:bob", "bob", ["t4"]],
      ["owner:zed", "zed", ["t1", "t3"]],
    ]);
  });

  it("orders the groups as the caller says, leaving out those with no items", () => {
    const groups = groupItems(tasks.slice(0, 3), "stage", keyOf, (a, b) => STAGES.indexOf(a) - STAGES.indexOf(b));
    expect(groups.map((g) => [g.id, titles(g.items)])).toEqual([
      ["stage:todo", ["t2", "t3"]],
      ["stage:done", ["t1"]],
    ]);
  });
});

describe("groupItems with several keys", () => {
  it("puts an item in the group of each of its keys, and one with none in the group of the empty key", () => {
    type Card = { title: string; people: string[] };
    const cards: Card[] = [{ title: "c1", people: ["zed", "amy"] }, { title: "c2", people: [] }, { title: "c3", people: ["amy"] }];
    const groups = groupItems(cards, "person", (card) => (card.people.length ? card.people : [""]));
    expect(groups.map((g) => [g.id, g.items.map((c) => c.title)])).toEqual([
      ["person:", ["c2"]],
      ["person:amy", ["c1", "c3"]],
      ["person:zed", ["c1"]],
    ]);
  });
});

describe("toggleCollapsed", () => {
  it("folds a group that is open and opens one that is folded, leaving the set it was given alone", () => {
    const none = new Set<string>();
    const folded = toggleCollapsed(none, "owner:amy");
    expect([...folded]).toEqual(["owner:amy"]);
    expect([...toggleCollapsed(folded, "owner:amy")]).toEqual([]);
    expect(none.size).toBe(0);
  });
});
