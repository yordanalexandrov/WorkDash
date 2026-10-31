// The table's PR side: one item per open PR with its section, the columns, and how PRs group (see table.ts).

import { SECTIONS } from "../../src/domain/classify.js";
import type { DashboardPullRequest, DashboardState, Section } from "./api.js";
import { shortRepo } from "./format.js";
import { checkRank, mergeRank, reasonRank, reviewRank } from "./marks.js";
import type { GroupBy, Sort, TableColumn } from "./table.js";

/** One row of the table: an open PR and the section it is in. */
export type PrItem = { pr: DashboardPullRequest; section: Section };

/** The open PRs of the sections, in section order. */
export function prItems(sections: DashboardState["sections"]): PrItem[] {
  return sections.flatMap(({ section, pullRequests }) => pullRequests.map((pr) => ({ pr, section })));
}

/** The table opens sorted by section, ascending. */
export const DEFAULT_SORT: Sort = { key: "section", dir: 1 };

/** The columns, in the order they show. */
export const PR_COLUMNS: TableColumn<PrItem>[] = [
  { key: "section", label: "секция", value: ({ section }) => SECTIONS.indexOf(section) },
  { key: "repo", label: "repo", value: ({ pr }) => shortRepo(pr.repo) },
  { key: "number", label: "#", align: "r", value: ({ pr }) => pr.number, first: -1 },
  { key: "title", label: "заглавие", value: ({ pr }) => pr.title.toLowerCase() },
  { key: "author", label: "автор", value: ({ pr }) => pr.author.toLowerCase() },
  { key: "reason", label: "защо", title: "Защо чака теб", value: ({ pr }) => reasonRank(pr.reason) },
  { key: "ci", label: "CI", align: "c", value: ({ pr }) => checkRank(pr.ci) },
  { key: "sonar", label: "SQ", title: "Sonar", align: "c", value: ({ pr }) => checkRank(pr.sonar) },
  { key: "merge", label: "merge", value: ({ pr }) => mergeRank(pr) },
  { key: "reviews", label: "review", value: ({ pr }) => reviewRank(pr), first: -1 },
  { key: "unread", label: "💬", title: "Непрочетени коментари", align: "c", value: ({ pr }) => pr.unreadComments ?? 0, first: -1 },
  { key: "jira", label: "Jira", value: ({ pr }) => pr.jira[0]?.key },
  { key: "age", label: "възр.", title: "Отворен преди", align: "r", value: ({ pr }) => Date.parse(pr.createdAt), first: -1 },
  { key: "updated", label: "актив.", title: "Последна активност", align: "r", value: ({ pr }) => Date.parse(pr.updatedAt), first: -1 },
  { key: "action", label: "" },
];

/** The "Групирай по" choices and their labels. */
export const PR_GROUPINGS: [GroupBy, string][] = [
  ["none", "нищо"],
  ["section", "секция"],
  ["repo", "repo"],
  ["author", "автор"],
];

/** The group a row falls in: its section, its repo (full name) or its author. */
export function prGroupKey({ pr, section }: PrItem, by: GroupBy): string {
  return by === "section" ? section : by === "repo" ? pr.repo : pr.author;
}

/** Sections group in section order; repos and authors by name. */
export function prGroupOrder(by: GroupBy): ((a: string, b: string) => number) | undefined {
  return by === "section" ? (a, b) => SECTIONS.indexOf(a as Section) - SECTIONS.indexOf(b as Section) : undefined;
}
