/**
 * Reference puzzles used by the tests and the benchmark. Solutions were
 * produced by the solvers in this repo and cross-checked between the
 * backtracking and DLX implementations; the Inkala 2012 solution also matches
 * the published one.
 */
export interface Fixture {
  name: string;
  source: string;
  puzzle: string;
  solution: string;
}

export const EASY: Fixture = {
  name: 'Project Euler 96, grid 01',
  source: 'Project Euler problem 96',
  puzzle: '003020600900305001001806400008102900700000008006708200002609500800203009005010300',
  solution: '483921657967345821251876493548132976729564138136798245372689514814253769695417382',
};

export const SEVENTEEN: Fixture = {
  name: '17-clue puzzle',
  source: "Gordon Royle's collection of 17-clue puzzles",
  puzzle: '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
  solution: '693784512487512936125963874932651487568247391741398625319475268856129743274836159',
};

export const INKALA_2012: Fixture = {
  name: 'Arto Inkala (2012)',
  source: 'Published by Arto Inkala as the "world\'s hardest Sudoku"',
  puzzle: '800000000003600000070090200050007000000045700000100030001000068008500010090000400',
  solution: '812753649943682175675491283154237896369845721287169534521974368438526917796318452',
};

export const AI_ESCARGOT: Fixture = {
  name: 'AI Escargot',
  source: 'Arto Inkala (2006)',
  puzzle: '1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..',
  solution: '162857493534129678789643521475312986913586742628794135356478219241935867897261354',
};

export const EASTER_MONSTER: Fixture = {
  name: 'Easter Monster',
  source: 'Posted on the Sudoku Players\' Forum (2007)',
  puzzle: '1.......2.9.4...5...6...7...5.9.3.......7.......85..4.7.....6...3...9.8...2.....1',
  solution: '174385962293467158586192734451923876928674315367851249719548623635219487842736591',
};

export const UNIQUE: readonly Fixture[] = [EASY, SEVENTEEN, INKALA_2012, AI_ESCARGOT, EASTER_MONSTER];

/** From Peter Norvig's essay on Sudoku solving; it has more than one solution. */
export const NORVIG_HARD1 = '.....6....59.....82....8....45........3........6..3.54...325..6..................';

/** Valid givens (no duplicates) that still admit no solution: r1c9 has no digit left. */
export const UNSOLVABLE = '12345678.........9' + '.'.repeat(63);
