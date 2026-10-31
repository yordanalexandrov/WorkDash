import type { ClosedPullRequest, DashboardPullRequest, Section } from "../api.js";
import { ACCENT } from "../board.js";
import { prKey } from "../detail.js";
import { sectionTitle, shortRepo } from "../format.js";
import { prFlipKey } from "../motion.js";
import { type PrItem, PR_COLUMNS, PR_GROUPINGS, prGroupKey, prGroupOrder } from "../prTable.js";
import { type GroupBy, groupItems, nextSort, type Sort, sortItems } from "../table.js";
import { Avatar } from "./Avatar.js";
import type { GroupHeadLook } from "./GroupHead.js";
import { ClosedRow } from "./ClosedRow.js";
import { PrRow } from "./PrRow.js";
import { Table, type TableGroup } from "./Table.js";

/** The folding of "Наскоро затворени", whatever the rows are grouped by. */
export const CLOSED_GROUP = "closed";

type Row = { open: PrItem } | { closed: ClosedPullRequest };

type PrTableProps = {
  /** The open PRs the filter keeps, and the closed ones, most recently closed first. */
  items: PrItem[];
  closed: ClosedPullRequest[];
  hue(repo: string): number;
  /** What is typed in the filter, for the message when nothing matches. */
  query: string;
  sort: Sort;
  onSort(sort: Sort): void;
  groupBy: GroupBy;
  onGroupBy(by: GroupBy): void;
  collapsed: ReadonlySet<string>;
  onToggle(id: string): void;
  onSeen(pr: DashboardPullRequest): Promise<void>;
  onOpen(pr: DashboardPullRequest, from: HTMLElement): void;
  /** The key (`<repo>#<number>`) of the PR whose sheet is open, whose row hides meanwhile. */
  openKey: string | null;
  booted: boolean;
};

/** The PRs as a table: the open ones sorted and grouped, then "Наскоро затворени" at the bottom in the server's order. */
export function PrTable({ items, closed, hue, query, sort, onSort, groupBy, onGroupBy, collapsed, onToggle, onSeen, onOpen, openKey, booted }: PrTableProps) {
  const sorted = sortItems(items, PR_COLUMNS, sort, ({ pr }) => pr.updatedAt);
  const groups: TableGroup<Row>[] = groupItems(sorted, groupBy, prGroupKey, prGroupOrder(groupBy)).map((group) => ({
    id: group.id,
    ...(groupBy === "none" ? {} : { head: groupHead(groupBy, group.key, hue) }),
    items: group.items.map((open) => ({ open })),
  }));
  if (closed.length) {
    groups.push({ id: CLOSED_GROUP, head: { color: ACCENT.closed, label: "Наскоро затворени" }, items: closed.map((pr) => ({ closed: pr })) });
  }
  const trimmed = query.trim();
  return (
    <Table<Row>
      columns={PR_COLUMNS}
      sort={sort}
      onSort={(column) => onSort(nextSort(sort, column))}
      groupings={PR_GROUPINGS}
      groupBy={groupBy}
      onGroupBy={onGroupBy}
      groups={groups}
      collapsed={collapsed}
      onToggle={onToggle}
      message={items.length ? null : trimmed ? `Нищо не съвпада с „${trimmed}“` : "Няма отворени PR-и"}
      booted={booted}
      row={(row, index) =>
        "open" in row ? (
          <PrRow
            key={prFlipKey(row.open.pr)}
            pr={row.open.pr}
            section={row.open.section}
            hue={hue(row.open.pr.repo)}
            index={index}
            onOpen={onOpen}
            ghost={openKey === prKey(row.open.pr)}
            {...(row.open.section === "waiting_on_me" ? { onSeen } : {})}
          />
        ) : (
          <ClosedRow key={prFlipKey(row.closed)} pr={row.closed} hue={hue(row.closed.repo)} index={index} />
        )
      }
    />
  );
}

/** A section's head in its accent with its full name; a repo's with its colour dot, short and full name; an author's with the avatar. */
function groupHead(by: GroupBy, key: string, hue: (repo: string) => number): GroupHeadLook {
  if (by === "section") return { color: ACCENT[key as Section], label: sectionTitle(key as Section) };
  if (by === "repo") {
    return { color: `hsl(${hue(key)} 70% var(--stripe-l))`, label: shortRepo(key), sub: key, lead: <span class="dot" style={{ "--rh": hue(key) }} aria-hidden="true" /> };
  }
  return { color: "var(--text)", label: key, lead: <Avatar login={key} /> };
}
