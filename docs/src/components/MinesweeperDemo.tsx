import { useMemo, useState } from "react";
// useUmpireWithDevtools powers the named instance in the optional panel on this page.
// Swap back to: import { useUmpire } from '@umpire/react'  (remove leading id arg)
import { useUmpireWithDevtools } from "@umpire/devtools/react";
import {
  buildBoard,
  buildMinesweeperReadInput,
  canInteractReadKey,
  cascadeReveal,
  cellKey,
  checkWin,
  createBoard,
  createMinesweeperReads,
  createMinesweeperUmpire,
  displayReadKey,
  adjacentMinesReadKey,
  type Board,
  type CellKey,
  type CellMeta,
  type GameConditions,
  type Values,
} from "../lib/minesweeper-engine.js";

const BOARD_WIDTH = 8;
const BOARD_HEIGHT = 8;
const MINE_COUNT = 10;

const EMPTY_BOARD = createBoard(BOARD_WIDTH, BOARD_HEIGHT);
const CELL_ORDER = Object.values(EMPTY_BOARD);
const MINESWEEPER_READS = createMinesweeperReads(BOARD_WIDTH, BOARD_HEIGHT);

const STATUS_FACE: Record<GameConditions["gameStatus"], string> = {
  idle: "•_•",
  playing: "•‿•",
  lost: "•︵•",
  won: "◝(ᵔᗜᵔ)◜",
};

const STATUS_LABEL: Record<GameConditions["gameStatus"], string> = {
  idle: "Ready",
  playing: "Playing",
  lost: "Lost",
  won: "Won",
};

type CellInspector = {
  key: CellKey;
  x: number;
  y: number;
};

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function createPrng(seed: number) {
  let state = seed >>> 0;

  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickMinePositions(
  width: number,
  height: number,
  mineCount: number,
  safeCell: [number, number],
  seed: number,
): Array<[number, number]> {
  const positions: Array<[number, number]> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === safeCell[0] && y === safeCell[1]) {
        continue;
      }

      positions.push([x, y]);
    }
  }

  const nextRandom = createPrng(seed);

  for (let index = positions.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    const current = positions[index];
    positions[index] = positions[swapIndex];
    positions[swapIndex] = current;
  }

  return positions.slice(0, mineCount);
}

function revealAllMines(board: Board, values: Values): Values {
  const next: Values = { ...values };

  for (const [key, cell] of Object.entries(board)) {
    if (cell.isMine) {
      next[key] = "revealed";
    }
  }

  return next;
}

function describeCellValue(value: Values[string]) {
  if (value === "revealed") {
    return "revealed";
  }

  if (value === "flagged") {
    return "flagged";
  }

  return "hidden";
}

function numberClass(adjacentMines: number) {
  if (adjacentMines < 1 || adjacentMines > 8) {
    return null;
  }

  return `c-minesweeper-demo__number--${adjacentMines}`;
}

export default function MinesweeperDemo({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [seed, setSeed] = useState(() => Date.now());
  const [values, setValues] = useState<Values>({});
  const [conditions, setConditions] = useState<GameConditions>({
    gameStatus: "playing",
    flagMode: false,
  });
  const [inspectedCell, setInspectedCell] = useState<CellInspector>({
    key: cellKey(0, 0),
    x: 0,
    y: 0,
  });

  const activeBoard = board ?? EMPTY_BOARD;
  const activeUmp = useMemo(
    () => createMinesweeperUmpire(activeBoard, MINESWEEPER_READS),
    [activeBoard],
  );
  const readInput = useMemo(
    () =>
      buildMinesweeperReadInput(activeBoard, values, conditions, {
        probeKey: inspectedCell.key,
        seeded: board !== null,
      }),
    [activeBoard, board, conditions, inspectedCell.key, values],
  );
  const readInspection = useMemo(
    () => MINESWEEPER_READS.inspect(readInput),
    [readInput],
  );
  const boardReads = readInspection.values;
  const { check: availability } = useUmpireWithDevtools(
    "minesweeper",
    activeUmp,
    values,
    conditions,
    {
      reads: readInspection,
    },
  );
  const flaggedCount = CELL_ORDER.reduce((count, cell) => {
    return count + (values[cellKey(cell.x, cell.y)] === "flagged" ? 1 : 0);
  }, 0);
  const inspectedAvailability = availability[inspectedCell.key];
  const inspectedAdjacent = boardReads[adjacentMinesReadKey(inspectedCell.key)];
  const inspectedCanInteract =
    boardReads[canInteractReadKey(inspectedCell.key)];
  const inspectedDisplay = boardReads[displayReadKey(inspectedCell.key)];
  const inspectedPreview =
    board === null
      ? "unseeded"
      : !inspectedCanInteract
        ? "blocked"
        : boardReads.probeWouldExplode
          ? "mine hit"
          : boardReads.probeCascade.length > 1
            ? `${boardReads.probeCascade.length} cells`
            : boardReads.probeCascade.length === 1
              ? "single reveal"
              : "blocked";
  const inspectedJson = prettyJson({
    [inspectedCell.key]: {
      availability: inspectedAvailability,
      reads: {
        adjacentMines: inspectedAdjacent,
        canInteract: inspectedCanInteract,
        display: inspectedDisplay,
        probeCascade: boardReads.probeCascade,
        probeWouldExplode: boardReads.probeWouldExplode,
      },
    },
  });

  function inspect(cell: CellMeta) {
    setInspectedCell({
      key: cellKey(cell.x, cell.y),
      x: cell.x,
      y: cell.y,
    });
  }

  function resetGame() {
    setBoard(null);
    setSeed(Date.now());
    setValues({});
    setConditions({ gameStatus: "playing", flagMode: false });
    setInspectedCell({
      key: cellKey(0, 0),
      x: 0,
      y: 0,
    });
  }

  function toggleFlag(cell: CellMeta) {
    inspect(cell);

    if (conditions.gameStatus !== "playing") {
      return;
    }

    const key = cellKey(cell.x, cell.y);

    if (values[key] === "revealed") {
      return;
    }

    setValues((current) => ({
      ...current,
      [key]: current[key] === "flagged" ? undefined : "flagged",
    }));
  }

  function revealCell(cell: CellMeta) {
    inspect(cell);

    if (conditions.gameStatus !== "playing") {
      return;
    }

    const key = cellKey(cell.x, cell.y);
    const cellAvailability = availability[key];

    if (!cellAvailability.enabled) {
      return;
    }

    const nextBoard =
      board ??
      buildBoard(
        BOARD_WIDTH,
        BOARD_HEIGHT,
        pickMinePositions(
          BOARD_WIDTH,
          BOARD_HEIGHT,
          MINE_COUNT,
          [cell.x, cell.y],
          seed,
        ),
      );

    let nextValues: Values;
    let nextStatus: GameConditions["gameStatus"] = "playing";

    if (nextBoard[key].isMine) {
      nextStatus = "lost";
      nextValues = revealAllMines(nextBoard, { ...values, [key]: "revealed" });
    } else {
      nextValues = cascadeReveal(nextBoard, values, cell.x, cell.y);

      if (checkWin(nextBoard, nextValues)) {
        nextStatus = "won";
        nextValues = revealAllMines(nextBoard, nextValues);
      }
    }

    setBoard(nextBoard);
    setValues(nextValues);
    setConditions((current) => ({
      ...current,
      gameStatus: nextStatus,
    }));
  }

  function handleCellClick(cell: CellMeta) {
    if (conditions.flagMode) {
      toggleFlag(cell);
      return;
    }

    revealCell(cell);
  }

  return (
    <div
      className={cls(
        "c-minesweeper-demo",
        "c-umpire-demo",
        compact && "c-minesweeper-demo--compact",
      )}
    >
      <div className={cls("c-minesweeper-demo__layout")}>
        <section
          className={cls(
            "c-umpire-demo__panel",
            "c-minesweeper-demo__panel",
            "c-minesweeper-demo__panel--board",
          )}
        >
          <div className="c-umpire-demo__panel-header">
            <div>
              <div className="c-umpire-demo__eyebrow">Playable example</div>
              <h2 className="c-umpire-demo__title">Minesweeper</h2>
            </div>
            <span className="c-umpire-demo__panel-accent">
              64 fields / 192 read-backed rules
            </span>
          </div>

          <div className="c-umpire-demo__panel-body c-minesweeper-demo__panel-body">
            <div className="c-minesweeper-demo__controls">
              <div
                className="c-minesweeper-demo__mode-toggle"
                aria-label="Interaction mode"
              >
                <button
                  type="button"
                  aria-pressed={!conditions.flagMode}
                  className={cls(
                    "c-minesweeper-demo__mode-button",
                    !conditions.flagMode &&
                      "c-minesweeper-demo__mode-button is-active",
                  )}
                  onClick={() =>
                    setConditions((current) => ({
                      ...current,
                      flagMode: false,
                    }))
                  }
                >
                  Dig
                </button>
                <button
                  type="button"
                  aria-pressed={conditions.flagMode}
                  className={cls(
                    "c-minesweeper-demo__mode-button",
                    conditions.flagMode &&
                      "c-minesweeper-demo__mode-button is-active",
                  )}
                  onClick={() =>
                    setConditions((current) => ({ ...current, flagMode: true }))
                  }
                >
                  Flag
                </button>
              </div>

              <div className="c-minesweeper-demo__status">
                <span className="c-minesweeper-demo__status-label c-umpire-demo__eyebrow">
                  {STATUS_LABEL[conditions.gameStatus]}
                </span>
                <span className="c-minesweeper-demo__face" aria-hidden="true">
                  {STATUS_FACE[conditions.gameStatus]}
                </span>
              </div>

              <div className="c-minesweeper-demo__counter">
                <span className="c-minesweeper-demo__counter-label c-umpire-demo__eyebrow">
                  Mines
                </span>
                <span
                  className={cls(
                    "c-minesweeper-demo__counter-value",
                    MINE_COUNT - flaggedCount < 0 &&
                    "c-minesweeper-demo__counter-value--negative",
                  )}
                >
                  {MINE_COUNT - flaggedCount}
                </span>
              </div>

              <button
                type="button"
                className="c-minesweeper-demo__new-game"
                onClick={resetGame}
              >
                New Game
              </button>
            </div>

            <section className="c-minesweeper-demo-board">
              <div className="c-minesweeper-demo-board__shell">
                <div
                  className="c-minesweeper-demo__grid"
                  style={{
                    gridTemplateColumns: `repeat(${BOARD_WIDTH}, minmax(44px, 1fr))`,
                  }}
                >
                  {CELL_ORDER.map((cell) => {
                    const key = cellKey(cell.x, cell.y);
                    const cellAvailability = availability[key];
                    const value = values[key];
                    const display = boardReads[displayReadKey(key)];
                    const isRevealed =
                      display.kind === "mine" ||
                      display.kind === "empty" ||
                      display.kind === "number";
                    const isMine = display.kind === "mine";

                    return (
                      <button
                        key={key}
                        type="button"
                        aria-disabled={!cellAvailability.enabled}
                        aria-label={`Cell ${cell.x + 1}, ${cell.y + 1}: ${describeCellValue(value)}`}
                        className={cls(
                          "c-minesweeper-demo__cell",
                          !isRevealed && "c-minesweeper-demo__cell is-hidden",
                          isRevealed && "c-minesweeper-demo__cell is-revealed",
                          value === "flagged" &&
                            "c-minesweeper-demo__cell is-flagged",
                          isMine && "c-minesweeper-demo__cell--mine",
                          !cellAvailability.enabled &&
                            "c-minesweeper-demo__cell is-disabled",
                        )}
                        onClick={() => handleCellClick(cell)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          // Touch devices use the explicit mode toggle instead of long-press hacks.
                          toggleFlag(cell);
                        }}
                        onMouseEnter={() => inspect(cell)}
                        onFocus={() => inspect(cell)}
                      >
                        {display.kind === "flagged" && (
                          <span className="c-minesweeper-demo__flag">⚑</span>
                        )}
                        {isMine && (
                          <span className="c-minesweeper-demo__mine">✺</span>
                        )}
                        {display.kind === "number" && (
                          <span
                            className={cls(
                              "c-minesweeper-demo__number",
                              numberClass(display.count),
                            )}
                          >
                            {display.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {!compact && (
                <section
                  className={cls(
                    "c-minesweeper-demo-board__panel",
                    "c-minesweeper-demo__panel",
                    "c-minesweeper-demo__panel--inspector",
                  )}
                >
                  <div className="c-minesweeper-demo__inspector-body">
                    <div className="c-minesweeper-demo__inspector-meta">
                      <div className="c-minesweeper-demo__inspector-row">
                        <span className="c-minesweeper-demo__inspector-label c-umpire-demo__eyebrow">
                          Coords
                        </span>
                        <span className="c-minesweeper-demo__inspector-value">
                          ({inspectedCell.x}, {inspectedCell.y})
                        </span>
                      </div>
                      <div className="c-minesweeper-demo__inspector-row">
                        <span className="c-minesweeper-demo__inspector-label c-umpire-demo__eyebrow">
                          Value
                        </span>
                        <span className="c-minesweeper-demo__inspector-value">
                          {describeCellValue(values[inspectedCell.key])}
                        </span>
                      </div>
                      <div className="c-minesweeper-demo__inspector-row">
                        <span className="c-minesweeper-demo__inspector-label c-umpire-demo__eyebrow">
                          Board
                        </span>
                        <span className="c-minesweeper-demo__inspector-value">
                          {board
                            ? boardReads.probeWouldExplode
                              ? "mine"
                              : inspectedAdjacent === null ||
                                  inspectedAdjacent === 0
                                ? "clear"
                                : `${inspectedAdjacent} adjacent`
                            : "unseeded"}
                        </span>
                      </div>
                      <div className="c-minesweeper-demo__inspector-row">
                        <span className="c-minesweeper-demo__inspector-label c-umpire-demo__eyebrow">
                          Preview
                        </span>
                        <span className="c-minesweeper-demo__inspector-value">
                          {inspectedPreview}
                        </span>
                      </div>
                    </div>

                    <section className="c-umpire-demo__json-shell">
                      <div className="c-umpire-demo__json-header">
                        <span className="c-umpire-demo__json-title">
                          availability + reads
                        </span>
                        <span className="c-umpire-demo__json-meta">
                          useUmpire() + createReads()
                        </span>
                      </div>
                      <pre className="c-umpire-demo__code-block">
                        <code>{inspectedJson}</code>
                      </pre>
                    </section>
                  </div>
                </section>
              )}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
