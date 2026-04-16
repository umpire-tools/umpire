import { umpire } from "@umpire/core";
import type { FieldDef, FieldValues, Rule, Umpire } from "@umpire/core";
import { createReads, enabledWhenRead } from "@umpire/reads";
import type { PredicateReadKey, ReadTable } from "@umpire/reads";

export type CellKey = `c_${number}_${number}`;

export type CellMeta = {
  x: number;
  y: number;
  isMine: boolean;
  adjacentMines: number;
};

export type Board = Record<string, CellMeta>;

export type CellValue = "revealed" | "flagged" | undefined;

export type Values = Record<string, CellValue>;

type MinesweeperFields = Record<CellKey, FieldDef<CellValue>>;

export type GameConditions = {
  gameStatus: "idle" | "playing" | "won" | "lost";
  flagMode: boolean;
};

export type DisplayState =
  | { kind: "hidden" }
  | { kind: "flagged" }
  | { kind: "mine" }
  | { kind: "empty" }
  | { kind: "number"; count: number };

type ValueInputKey = `value:${CellKey}`;
type MineInputKey = `mine:${CellKey}`;
type NotRevealedReadKey = `notRevealed:${CellKey}`;
type NotFlagBlockedReadKey = `notFlagBlocked:${CellKey}`;
type CanInteractReadKey = `canInteract:${CellKey}`;
type AdjacentMinesReadKey = `adjacentMines:${CellKey}`;
type IsZeroReadKey = `isZero:${CellKey}`;
type DisplayReadKey = `display:${CellKey}`;

export type MinesweeperReadInput = {
  flagMode: boolean;
  gameStatus: GameConditions["gameStatus"];
  probeKey: CellKey | null;
  seeded: boolean;
} & Record<MineInputKey, boolean> &
  Record<ValueInputKey, CellValue>;

export type MinesweeperReads = {
  gameActive: boolean;
  probeCascade: CellKey[];
  probeWouldExplode: boolean;
} & Record<NotRevealedReadKey, boolean> &
  Record<NotFlagBlockedReadKey, boolean> &
  Record<CanInteractReadKey, boolean> &
  Record<AdjacentMinesReadKey, number | null> &
  Record<IsZeroReadKey, boolean> &
  Record<DisplayReadKey, DisplayState>;

type MinesweeperReadResolverContext = {
  input: MinesweeperReadInput;
  read<K extends keyof MinesweeperReads & string>(key: K): MinesweeperReads[K];
};

type MinesweeperReadResolvers = {
  [K in keyof MinesweeperReads]: (
    context: MinesweeperReadResolverContext,
  ) => MinesweeperReads[K];
};

const OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

export function cellKey(x: number, y: number): CellKey {
  return `c_${x}_${y}` as CellKey;
}

function parseCellKey(key: CellKey): [number, number] {
  const parts = key.split("_");
  return [Number(parts[1]), Number(parts[2])];
}

function valueInputKey(key: CellKey): ValueInputKey {
  return `value:${key}` as ValueInputKey;
}

function mineInputKey(key: CellKey): MineInputKey {
  return `mine:${key}` as MineInputKey;
}

function notRevealedReadKey(key: CellKey): NotRevealedReadKey {
  return `notRevealed:${key}` as NotRevealedReadKey;
}

function notFlagBlockedReadKey(key: CellKey): NotFlagBlockedReadKey {
  return `notFlagBlocked:${key}` as NotFlagBlockedReadKey;
}

export function canInteractReadKey(key: CellKey): CanInteractReadKey {
  return `canInteract:${key}` as CanInteractReadKey;
}

export function adjacentMinesReadKey(key: CellKey): AdjacentMinesReadKey {
  return `adjacentMines:${key}` as AdjacentMinesReadKey;
}

function isZeroReadKey(key: CellKey): IsZeroReadKey {
  return `isZero:${key}` as IsZeroReadKey;
}

export function displayReadKey(key: CellKey): DisplayReadKey {
  return `display:${key}` as DisplayReadKey;
}

function neighborKeys(
  x: number,
  y: number,
  width: number,
  height: number,
): CellKey[] {
  const neighbors: CellKey[] = [];

  for (const [dx, dy] of OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;

    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      continue;
    }

    neighbors.push(cellKey(nx, ny));
  }

  return neighbors;
}

export function createBoard(width: number, height: number): Board {
  const board: Board = {};

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      board[cellKey(x, y)] = { x, y, isMine: false, adjacentMines: 0 };
    }
  }

  return board;
}

export function placeMines(
  board: Board,
  minePositions: Array<[number, number]>,
): Board {
  const next: Board = {};

  for (const [key, cell] of Object.entries(board)) {
    next[key] = { ...cell };
  }

  for (const [x, y] of minePositions) {
    const key = cellKey(x, y);

    if (next[key]) {
      next[key] = { ...next[key], isMine: true };
    }
  }

  return next;
}

export function computeAdjacency(board: Board): Board {
  const next: Board = {};

  for (const [key, cell] of Object.entries(board)) {
    const count = OFFSETS.reduce((sum, [dx, dy]) => {
      const neighbor = board[cellKey(cell.x + dx, cell.y + dy)];
      return sum + (neighbor?.isMine ? 1 : 0);
    }, 0);

    next[key] = { ...cell, adjacentMines: count };
  }

  return next;
}

export function cascadeReveal(
  board: Board,
  values: Values,
  x: number,
  y: number,
): Values {
  const next: Values = { ...values };
  const startKey = cellKey(x, y);
  const startCell = board[startKey];

  if (!startCell || startCell.isMine) {
    return next;
  }

  next[startKey] = "revealed";

  if (startCell.adjacentMines > 0) {
    return next;
  }

  const queue: CellKey[] = [startKey];
  const visited = new Set<CellKey>([startKey]);

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    const [cx, cy] = parseCellKey(currentKey);

    for (const [dx, dy] of OFFSETS) {
      const neighborKey = cellKey(cx + dx, cy + dy);
      const neighbor = board[neighborKey];

      if (!neighbor || visited.has(neighborKey)) {
        continue;
      }

      visited.add(neighborKey);

      if (neighbor.isMine) {
        continue;
      }

      next[neighborKey] = "revealed";

      if (neighbor.adjacentMines === 0) {
        queue.push(neighborKey);
      }
    }
  }

  return next;
}

export function checkWin(board: Board, values: Values): boolean {
  for (const [key, cell] of Object.entries(board)) {
    if (!cell.isMine && values[key] !== "revealed") {
      return false;
    }
  }

  return true;
}

function buildProbeCascade(
  input: MinesweeperReadInput,
  read: <K extends keyof MinesweeperReads & string>(
    key: K,
  ) => MinesweeperReads[K],
  width: number,
  height: number,
): CellKey[] {
  const startKey = input.probeKey;

  if (!startKey || !input.seeded) {
    return [];
  }

  if (
    input[valueInputKey(startKey)] === "revealed" ||
    input[valueInputKey(startKey)] === "flagged" ||
    input[mineInputKey(startKey)]
  ) {
    return [];
  }

  const revealed = new Set<CellKey>([startKey]);
  const visited = new Set<CellKey>([startKey]);
  const queue: CellKey[] = [];

  if (read(adjacentMinesReadKey(startKey)) === 0) {
    queue.push(startKey);
  }

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    const [cx, cy] = parseCellKey(currentKey);

    for (const neighborKey of neighborKeys(cx, cy, width, height)) {
      if (visited.has(neighborKey)) {
        continue;
      }

      visited.add(neighborKey);

      if (input[mineInputKey(neighborKey)]) {
        continue;
      }

      revealed.add(neighborKey);

      if (read(adjacentMinesReadKey(neighborKey)) === 0) {
        queue.push(neighborKey);
      }
    }
  }

  return [...revealed];
}

export function createMinesweeperReads(
  width: number,
  height: number,
): ReadTable<MinesweeperReadInput, MinesweeperReads> {
  const resolvers = {
    gameActive: ({ input }) => input.gameStatus === "playing",
    probeWouldExplode: ({ input }) =>
      input.probeKey !== null &&
      input.seeded &&
      input[mineInputKey(input.probeKey)],
    probeCascade: ({ input, read }) =>
      buildProbeCascade(input, read, width, height),
  } as MinesweeperReadResolvers;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = cellKey(x, y);
      const neighbors = neighborKeys(x, y, width, height);

      resolvers[notRevealedReadKey(key)] = ({ input }) =>
        input[valueInputKey(key)] !== "revealed";
      resolvers[notFlagBlockedReadKey(key)] = ({ input }) => {
        if (input.flagMode) {
          return true;
        }

        return input[valueInputKey(key)] !== "flagged";
      };
      resolvers[adjacentMinesReadKey(key)] = ({ input }) => {
        if (!input.seeded) {
          return null;
        }

        return neighbors.reduce((sum, neighborKey) => {
          return sum + (input[mineInputKey(neighborKey)] ? 1 : 0);
        }, 0);
      };
      resolvers[isZeroReadKey(key)] = ({ read }) =>
        read(adjacentMinesReadKey(key)) === 0;
      resolvers[canInteractReadKey(key)] = ({ read }) =>
        read("gameActive") &&
        read(notRevealedReadKey(key)) &&
        read(notFlagBlockedReadKey(key));
      resolvers[displayReadKey(key)] = ({ input, read }) => {
        const value = input[valueInputKey(key)];

        if (value === "flagged") {
          return { kind: "flagged" };
        }

        if (value !== "revealed") {
          return { kind: "hidden" };
        }

        if (input[mineInputKey(key)]) {
          return { kind: "mine" };
        }

        const count = read(adjacentMinesReadKey(key));

        if (count === null || count === 0) {
          return { kind: "empty" };
        }

        return { count, kind: "number" };
      };
    }
  }

  return createReads<MinesweeperReadInput, MinesweeperReads>(resolvers);
}

export function buildMinesweeperReadInput(
  board: Board,
  values: FieldValues<MinesweeperFields>,
  conditions: GameConditions,
  options: {
    probeKey?: CellKey | null;
    seeded?: boolean;
  } = {},
): MinesweeperReadInput {
  const input = {
    flagMode: conditions.flagMode,
    gameStatus: conditions.gameStatus,
    probeKey: options.probeKey ?? null,
    seeded: options.seeded ?? true,
  } as Partial<MinesweeperReadInput>;

  for (const key of Object.keys(board) as CellKey[]) {
    input[valueInputKey(key)] = values[key];
    input[mineInputKey(key)] = board[key]?.isMine ?? false;
  }

  return input as MinesweeperReadInput;
}

export function createMinesweeperUmpire(
  board: Board,
  reads: ReadTable<MinesweeperReadInput, MinesweeperReads>,
): Umpire<MinesweeperFields, GameConditions> {
  const keys = Object.keys(board) as CellKey[];
  const fields = {} as MinesweeperFields;

  for (const key of keys) {
    fields[key] = { default: undefined };
  }

  const selectInput = (
    values: FieldValues<MinesweeperFields>,
    conditions: GameConditions,
  ) =>
    buildMinesweeperReadInput(board, values, conditions);

  const enabledWhenCellRead = (
    field: CellKey,
    key: PredicateReadKey<MinesweeperReads>,
    reason: string,
  ): Rule<MinesweeperFields, GameConditions> =>
    enabledWhenRead<
      MinesweeperFields,
      GameConditions,
      MinesweeperReadInput,
      MinesweeperReads
    >(field, key, reads, {
      reason,
      selectInput,
    });

  const rules = keys.flatMap((key) => [
    enabledWhenCellRead(key, "gameActive", "GAME_OVER"),
    enabledWhenCellRead(key, notRevealedReadKey(key), "ALREADY_REVEALED"),
    enabledWhenCellRead(key, notFlagBlockedReadKey(key), "FLAGGED"),
  ]);

  return umpire({ fields, rules });
}

export function buildBoard(
  width: number,
  height: number,
  minePositions: Array<[number, number]>,
): Board {
  return computeAdjacency(
    placeMines(createBoard(width, height), minePositions),
  );
}
