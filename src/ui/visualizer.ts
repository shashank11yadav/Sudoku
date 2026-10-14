import {
  BacktrackStepper,
  CELLS,
  POPCOUNT,
  TECHNIQUES,
  applyStep,
  bit,
  cellName,
  createLogicState,
  findNextStep,
  parseGrid,
  type Grid,
  type LogicState,
  type Step,
} from '../engine';
import { byId } from './dom';
import { GridView } from './grid-view';

type Algorithm = 'mrv' | 'naive' | 'logic';

const PRESETS: Readonly<Record<string, string>> = {
  inkala: '800000000003600000070090200050007000000045700000100030001000068008500010090000400',
  easter: '1.......2.9.4...5...6...7...5.9.3.......7.......85..4.7.....6...3...9.8...2.....1',
  seventeen: '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
};

/**
 * Work per animation frame is capped, so even the fastest setting cannot
 * starve the main thread: the browser always gets to paint between batches.
 */
const MAX_STEPS_PER_FRAME = 4000;
/** Above this rate the explanation text would flicker unreadably, so it is skipped. */
const NARRATE_BELOW = 25;

/** Slider position 0-100 to steps per second on a log scale, 1 to 100,000. */
function speedFromSlider(v: number): number {
  return Math.max(1, Math.round(10 ** ((v / 100) * 5)));
}

export class Visualizer {
  private readonly grid: GridView;
  private readonly getCurrent: () => Grid | null;
  private readonly source = byId('viz-source', HTMLSelectElement);
  private readonly algo = byId('viz-algo', HTMLSelectElement);
  private readonly speedInput = byId('viz-speed', HTMLInputElement);
  private readonly speedOut = byId('viz-speed-out', HTMLOutputElement);
  private readonly playBtn = byId('viz-play', HTMLButtonElement);
  private readonly stepBtn = byId('viz-step', HTMLButtonElement);
  private readonly explain = byId('viz-explain');
  private readonly status = byId('viz-status');
  private readonly nodesOut = byId('viz-nodes');
  private readonly nodesLabel = byId('viz-nodes-label');
  private readonly backtracksOut = byId('viz-backtracks');
  private readonly emptyOut = byId('viz-empty');

  private puzzle: Grid = new Uint8Array(CELLS);
  private mode: Algorithm = 'mrv';
  private stepper: BacktrackStepper | null = null;
  private logic: LogicState | null = null;
  private lastStep: Step | null = null;
  private logicSteps = 0;
  private finished = false;
  private running = false;
  private frame = 0;
  private lastTime = 0;
  private budget = 0;
  private speed = speedFromSlider(Number(this.speedInput.value));
  private highlight = new Map<number, string>();

  constructor(getCurrent: () => Grid | null) {
    this.getCurrent = getCurrent;
    this.grid = new GridView(byId('viz-board'), 'viz');
    this.updateSpeed();

    this.playBtn.addEventListener('click', () => {
      if (this.running) this.pause();
      else this.play();
    });
    this.stepBtn.addEventListener('click', () => {
      this.pause();
      this.advance(1, true);
    });
    byId('viz-reset').addEventListener('click', () => {
      this.reset();
    });
    this.source.addEventListener('change', () => {
      this.reset();
    });
    this.algo.addEventListener('change', () => {
      this.reset();
    });
    this.speedInput.addEventListener('input', () => {
      this.updateSpeed();
    });
  }

  /** Called when the tab opens so "Current game" picks up the latest puzzle. */
  activate(): void {
    if (!this.running) this.reset();
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.playBtn.textContent = 'Play';
    this.explain.setAttribute('aria-live', 'polite');
  }

  private play(): void {
    if (this.finished) this.reset();
    this.running = true;
    this.playBtn.textContent = 'Pause';
    // Announcing every step while playing would flood a screen reader.
    this.explain.setAttribute('aria-live', 'off');
    this.lastTime = performance.now();
    this.budget = 0;
    this.frame = requestAnimationFrame((t) => {
      this.onFrame(t);
    });
  }

  private updateSpeed(): void {
    this.speed = speedFromSlider(Number(this.speedInput.value));
    const text = `${this.speed.toLocaleString('en-US')} steps/s`;
    this.speedOut.textContent = text;
    this.speedInput.setAttribute('aria-valuetext', text);
  }

  private reset(): void {
    this.pause();
    const key = this.source.value;
    const preset = PRESETS[key];
    this.puzzle = preset ? parseGrid(preset) : (this.getCurrent() ?? parseGrid(PRESETS['inkala'] ?? ''));
    const algo = this.algo.value;
    this.mode = algo === 'naive' || algo === 'logic' ? algo : 'mrv';
    this.stepper = this.mode === 'logic' ? null : new BacktrackStepper(this.puzzle, this.mode);
    this.logic = this.mode === 'logic' ? createLogicState(this.puzzle) : null;
    this.lastStep = null;
    this.logicSteps = 0;
    this.finished = false;
    this.highlight.clear();
    this.stepBtn.disabled = false;
    this.explain.textContent =
      this.mode === 'logic'
        ? 'Each step applies one human technique to the pencil marks.'
        : this.mode === 'mrv'
          ? 'Each step places a digit in the empty cell with the fewest candidates. Red cells are dead ends.'
          : 'Each step fills the next empty cell in reading order. Red cells are dead ends.';
    this.status.textContent = 'Ready';
    this.nodesLabel.textContent = this.mode === 'logic' ? 'Logical steps' : 'Nodes visited';
    this.renderAll();
  }

  private onFrame(time: number): void {
    if (!this.running) return;
    const dt = Math.min(time - this.lastTime, 250);
    this.lastTime = time;
    this.budget += (this.speed * dt) / 1000;
    const n = Math.min(Math.floor(this.budget), MAX_STEPS_PER_FRAME);
    if (n > 0) {
      this.budget -= n;
      if (this.budget > MAX_STEPS_PER_FRAME) this.budget = 0;
      this.advance(n, this.speed < NARRATE_BELOW);
    }
    if (this.finished) {
      this.pause();
      return;
    }
    this.frame = requestAnimationFrame((t) => {
      this.onFrame(t);
    });
  }

  /** Runs n solver steps, then repaints only the cells that changed. */
  private advance(n: number, narrate: boolean): void {
    if (this.finished) return;
    const dirty = new Set<number>(this.highlight.keys());
    this.highlight.clear();
    let message = '';

    if (this.stepper) {
      const s = this.stepper;
      for (let i = 0; i < n && !this.finished; i++) {
        const ev = s.step();
        if (ev.type === 'place') {
          dirty.add(ev.cell);
          if (i === n - 1) {
            this.highlight.set(ev.cell, 'viz-place');
            message = `Try ${ev.digit} in ${cellName(ev.cell)}.`;
          }
        } else if (ev.type === 'remove') {
          dirty.add(ev.cell);
          if (ev.deadEnd !== null) dirty.add(ev.deadEnd);
          if (i === n - 1) {
            if (ev.deadEnd !== null) this.highlight.set(ev.deadEnd, 'viz-dead');
            this.highlight.set(ev.cell, 'viz-dead');
            message =
              ev.deadEnd !== null
                ? `Dead end: ${cellName(ev.deadEnd)} has no digit left, so undo ${cellName(ev.cell)}.`
                : `Every digit failed below ${cellName(ev.cell)}, so back up.`;
          }
        } else {
          this.finished = true;
          message =
            ev.type === 'solved'
              ? `Solved after ${s.nodes.toLocaleString('en-US')} placements and ${s.backtracks.toLocaleString('en-US')} backtracks.`
              : 'This puzzle has no solution.';
        }
      }
      for (const c of dirty) this.renderCell(c);
    } else if (this.logic) {
      const state = this.logic;
      // Both ways of finishing below break out of the loop.
      for (let i = 0; i < n; i++) {
        if (!state.values.includes(0)) {
          this.finished = true;
          message = `Solved with ${this.logicSteps} logical steps.`;
          break;
        }
        const step = findNextStep(state);
        if (!step) {
          this.finished = true;
          message =
            'No technique this solver knows applies here. A person would need chains or trial and error; the backtracking modes finish it.';
          break;
        }
        applyStep(state, step);
        this.logicSteps++;
        this.lastStep = step;
        message = `${TECHNIQUES[step.technique].name}: ${step.description}`;
      }
      if (this.lastStep && !this.finished) {
        for (const c of this.lastStep.focus) this.highlight.set(c, 'hint-focus');
        for (const p of this.lastStep.placements) this.highlight.set(p.cell, 'viz-place');
        for (const e of this.lastStep.eliminations) this.highlight.set(e.cell, 'hint-target');
      }
      this.renderAll();
    }

    if (this.finished) {
      this.stepBtn.disabled = true;
      this.status.textContent = message.startsWith('Solved') ? 'Solved' : 'Stopped';
    } else {
      this.status.textContent = this.running ? 'Running' : 'Paused';
    }
    if (message && (narrate || this.finished)) this.explain.textContent = message;
    this.updateCounters();
  }

  private updateCounters(): void {
    const nodes = this.stepper ? this.stepper.nodes : this.logicSteps;
    this.nodesOut.textContent = nodes.toLocaleString('en-US');
    this.backtracksOut.textContent = (this.stepper?.backtracks ?? 0).toLocaleString('en-US');
    const values = this.stepper?.grid ?? this.logic?.values ?? this.puzzle;
    this.emptyOut.textContent = String(values.filter((d) => d === 0).length);
  }

  private renderCell(i: number): void {
    const values = this.stepper?.grid ?? this.logic?.values ?? this.puzzle;
    const cls = this.highlight.get(i);
    let notes = 0;
    let struck = 0;
    if (this.logic && !values[i]) {
      notes = this.logic.cands[i];
      if (this.lastStep) {
        for (const e of this.lastStep.eliminations) if (e.cell === i) struck |= bit(e.digit);
        // Eliminated digits are already gone from cands; draw them struck so the change is visible.
        notes |= struck;
      }
    }
    this.grid.update(i, {
      value: values[i],
      given: this.puzzle[i] !== 0,
      notes,
      struck,
      classes: cls ? [cls] : [],
      status: POPCOUNT[notes] && struck ? ['candidates removed'] : [],
    });
  }

  private renderAll(): void {
    for (let i = 0; i < CELLS; i++) this.renderCell(i);
    this.updateCounters();
  }
}
