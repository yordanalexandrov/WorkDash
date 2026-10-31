import type { ClosedIssue, StagedIssue } from "../api.js";
import type { ShownIssue } from "../issueDetail.js";
import { assignedToMe, stageMark } from "../issueMarks.js";
import { issueFlipKey } from "../motion.js";
import { ISSUE_GROUPINGS, issueGroups, type IssueRow as Row, issueRows, issueTableColumns, parentGroupLabel } from "../issueTable.js";
import { type Group, type GroupBy, nextSort, type Sort, sortItems } from "../table.js";
import { Avatar } from "./Avatar.js";
import type { GroupHeadLook } from "./GroupHead.js";
import { ClosedIssueRow, IssueRow } from "./IssueRow.js";
import { Table, type TableGroup } from "./Table.js";

/** The folding of "Наскоро затворени", whatever the rows are grouped by. */
export const CLOSED_ISSUES = "closed";

/** The table opens sorted by stage, in the board's order. */
export const ISSUE_DEFAULT_SORT: Sort = { key: "stage", dir: 1 };

type TableRow = Row | { closed: ClosedIssue };

type IssueTableProps = {
  /** The open issues the filter keeps, and the closed ones it keeps, most recently closed first. */
  issues: StagedIssue[];
  closed: ClosedIssue[];
  /** The open repo's stage labels, in the board's order. */
  stages: string[];
  /** The open repo's project hue. */
  hue: number;
  viewer: string | null;
  /** Why there is nothing to show, when there is nothing; the table adds what to say when only the filter keeps nothing. */
  message: string | null;
  /** What is typed in the filter, for the message when nothing matches. */
  query: string;
  sort: Sort;
  onSort(sort: Sort): void;
  groupBy: GroupBy;
  onGroupBy(by: GroupBy): void;
  collapsed: ReadonlySet<string>;
  onToggle(id: string): void;
  /** Opens the detail sheet of an issue, open or closed, growing out of its row. */
  onOpen(issue: ShownIssue, from: HTMLElement): void;
  /** The FLIP key of the card or row the sheet is open from, which hides while it is; null while no sheet is open. */
  openFlip: string | null;
  booted: boolean;
};

/**
 * The open repo's issues as a table: the open ones sorted and grouped (by assignee, an issue in the group of each of its
 * assignees; by parent, under `#n` and the parent's title), then "Наскоро затворени" folded at the bottom in the server's order.
 */
export function IssueTable({ issues, closed, stages, hue, viewer, message, query, sort, onSort, groupBy, onGroupBy, collapsed, onToggle, onOpen, openFlip, booted }: IssueTableProps) {
  const columns = issueTableColumns(stages);
  const sorted = sortItems(issues, columns, sort, (issue) => issue.updatedAt);
  const grouped = issueGroups(sorted, groupBy, stages);
  const groups: TableGroup<TableRow>[] = issueRows(grouped, collapsed).map((group, i) => ({
    id: group.id,
    ...(groupBy === "none" ? {} : { head: groupBy === "parent" ? parentHead(grouped[i]!) : groupHead(groupBy, group.key) }),
    items: group.rows,
  }));
  if (closed.length) {
    groups.push({ id: CLOSED_ISSUES, head: { color: "var(--merged)", label: "Наскоро затворени" }, items: closed.map((issue) => ({ closed: issue })) });
  }
  const trimmed = query.trim();
  return (
    <Table<TableRow>
      kind="issues"
      columns={columns}
      sort={sort}
      onSort={(column) => onSort(nextSort(sort, column))}
      groupings={ISSUE_GROUPINGS}
      groupBy={groupBy}
      onGroupBy={onGroupBy}
      groups={groups}
      collapsed={collapsed}
      onToggle={onToggle}
      message={message ?? (issues.length ? null : trimmed ? `Нищо не съвпада с „${trimmed}“` : "Няма отворени issues")}
      booted={booted}
      row={(row, index) =>
        "closed" in row ? (
          <ClosedIssueRow
            key={issueFlipKey(row.closed)}
            issue={row.closed}
            hue={hue}
            index={index}
            onOpen={onOpen}
            ghost={openFlip === issueFlipKey(row.closed)}
          />
        ) : (
          <IssueRow
            key={row.flip}
            issue={row.issue}
            flip={row.flip}
            hue={hue}
            index={index}
            mine={assignedToMe(row.issue, viewer)}
            onOpen={onOpen}
            ghost={openFlip === row.flip}
          />
        )
      }
    />
  );
}

/** A parent's head: `#n` and its title (`parentGroupLabel`); "Без родител" in `--faint`. */
function parentHead(group: Group<StagedIssue>): GroupHeadLook {
  return { color: group.key ? "var(--muted)" : "var(--faint)", label: parentGroupLabel(group, group.items[0]!.repo) };
}

/** A stage's head in its accent with the label's name; an assignee's with the avatar; a milestone's with ⚑. The empty key is "Без …". */
function groupHead(by: GroupBy, key: string): GroupHeadLook {
  if (by === "stage") return { color: stageMark(key || null).accent, label: key || "Без етап" };
  if (by === "assignee") return key ? { color: "var(--text)", label: key, lead: <Avatar login={key} /> } : { color: "var(--faint)", label: "Без assignee" };
  return key ? { color: "var(--muted)", label: `⚑ ${key}` } : { color: "var(--faint)", label: "Без milestone" };
}
