// The Issue dashboard's table: the columns (every fact of the issue card), how issues group, and the FLIP key of each row
// (see table.ts for the sorting and grouping themselves).

import { issueKey, sameRepo } from "../../src/domain/repos.js";
import type { StagedIssue } from "./api.js";
import { shortRepo } from "./format.js";
import { cardLabels } from "./issueBoard.js";
import { issueFlipKey } from "./motion.js";
import { type Group, type GroupBy, groupItems, type TableColumn } from "./table.js";

/** When a milestone is due, as a number that sorts; one without a due date after every one with. */
function due(milestone: { dueOn: string | null }): number {
  return milestone.dueOn ? Date.parse(milestone.dueOn) : Number.MAX_VALUE;
}

/**
 * The columns, in the order they show. The stage sorts in the board's order ("Без етап" first), a milestone by its due date
 * (one without a due date after those with one, an issue without a milestone last), the people by the first one's login.
 */
export function issueTableColumns(stages: string[]): TableColumn<StagedIssue>[] {
  return [
    { key: "number", label: "#", align: "r", value: (issue) => issue.number, first: -1 },
    { key: "title", label: "заглавие", value: (issue) => issue.title.toLowerCase() },
    { key: "stage", label: "етап", value: (issue) => (issue.stage === null ? -1 : stages.indexOf(issue.stage)) },
    { key: "labels", label: "етикети", value: (issue) => cardLabels(issue)[0]?.name.toLowerCase() },
    { key: "assignees", label: "assignees", value: (issue) => issue.assignees[0]?.toLowerCase() },
    { key: "author", label: "автор", value: (issue) => issue.author.toLowerCase() },
    { key: "comments", label: "💬", title: "Коментари", align: "c", value: (issue) => issue.comments, first: -1 },
    { key: "milestone", label: "milestone", value: (issue) => (issue.milestone ? due(issue.milestone) : undefined) },
    { key: "linked", label: "PR-и", title: "Свързани PR-и", value: (issue) => issue.linkedPullRequests.length, first: -1 },
    {
      key: "subIssues",
      label: "sub-issues",
      title: "Sub-issues: завършени от всички",
      value: ({ subIssues }) => (subIssues.total ? subIssues.completed / subIssues.total : undefined),
    },
    { key: "blockedBy", label: "блокиран от", title: "Отворени blockers", align: "c", value: (issue) => issue.dependencies.blockedBy, first: -1 },
    { key: "age", label: "възр.", title: "Отворен преди", align: "r", value: (issue) => Date.parse(issue.createdAt), first: -1 },
    { key: "updated", label: "обнов.", title: "Обновен преди", align: "r", value: (issue) => Date.parse(issue.updatedAt), first: -1 },
  ];
}

/** The "Групирай по" choices and their labels. */
export const ISSUE_GROUPINGS: [GroupBy, string][] = [
  ["none", "нищо"],
  ["stage", "етап"],
  ["assignee", "assignee"],
  ["milestone", "milestone"],
  ["parent", "родител"],
];

/** The group or groups an issue falls in; the empty key is "Без етап", "Без assignee", "Без milestone" or "Без родител". */
function groupKeys(issue: StagedIssue, by: GroupBy): string | string[] {
  if (by === "stage") return issue.stage ?? "";
  if (by === "assignee") return issue.assignees.length ? issue.assignees : [""];
  if (by === "parent") return issue.parent ? issueKey(issue.parent) : "";
  return issue.milestone?.title ?? "";
}

/**
 * The issues in groups, each keeping their order: by stage in the board's order ("Без етап" first); by assignee, an issue
 * in the group of each of its assignees, by login; by milestone in the order of their due dates; by parent in the order of
 * the parents' numbers, those of another repo after. The issues with no assignee, milestone or parent are last.
 */
export function issueGroups(issues: StagedIssue[], by: GroupBy, stages: string[]): Group<StagedIssue>[] {
  const milestones = new Map(issues.flatMap((issue) => (issue.milestone ? [[issue.milestone.title, due(issue.milestone)] as const] : [])));
  const parents = new Map(issues.flatMap((issue) => (issue.parent ? [[issueKey(issue.parent), { ...issue.parent, own: sameRepo(issue.parent.repo, issue.repo) }] as const] : [])));
  const byParent = (a: string, b: string): number => {
    const [p, q] = [parents.get(a)!, parents.get(b)!];
    return Number(q.own) - Number(p.own) || p.repo.localeCompare(q.repo) || p.number - q.number;
  };
  const order = (a: string, b: string): number => {
    if (by === "stage") return (a ? stages.indexOf(a) : -1) - (b ? stages.indexOf(b) : -1);
    if (!a || !b) return Number(!a) - Number(!b);
    if (by === "parent") return byParent(a, b);
    return by === "milestone" ? milestones.get(a)! - milestones.get(b)! || a.localeCompare(b) : a.localeCompare(b);
  };
  return groupItems(issues, by, groupKeys, order);
}

/**
 * The head of a parent's group: its number (with the repo's short name when it is another than `repo`) and title; the
 * group of the issues without a parent is "Без родител".
 */
export function parentGroupLabel(group: Group<StagedIssue>, repo: string): string {
  const parent = group.key ? group.items[0]?.parent : null;
  if (!parent) return "Без родител";
  return `${sameRepo(parent.repo, repo) ? "" : shortRepo(parent.repo)}#${parent.number} ${parent.title}`;
}

/** A row of the table: an issue and its FLIP key there. */
export type IssueRow = { issue: StagedIssue; flip: string };

/**
 * The groups' rows with their FLIP keys, unique in the table though an issue can be in several groups: of an issue's rows,
 * the first in an open group has the key of its card (`issueFlipKey`), so a switch of view lands the card on it and a regroup
 * glides it; any other has the group's id after it.
 */
export function issueRows(groups: Group<StagedIssue>[], collapsed: ReadonlySet<string>): { id: string; key: string; rows: IssueRow[] }[] {
  const taken = new Set<string>();
  const shownFirst = [...groups.filter((g) => !collapsed.has(g.id)), ...groups.filter((g) => collapsed.has(g.id))];
  const flips = new Map<Group<StagedIssue>, string[]>();
  for (const group of shownFirst) {
    flips.set(
      group,
      group.items.map((issue) => {
        const key = issueFlipKey(issue);
        if (taken.has(key)) return `${key}@${group.id}`;
        taken.add(key);
        return key;
      }),
    );
  }
  return groups.map((group) => ({ id: group.id, key: group.key, rows: group.items.map((issue, i) => ({ issue, flip: flips.get(group)![i]! })) }));
}
