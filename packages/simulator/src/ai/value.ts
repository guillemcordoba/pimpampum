/**
 * The learned value function: P(this team eventually wins | position).
 *
 * Deliberately a logistic regression rather than anything deeper. It has to be
 * evaluated tens of thousands of times inside the search, it has to be
 * trainable from a few thousand self-play games in seconds, and — most
 * usefully for a game-design instrument — its weights are readable, so "the
 * model thinks action economy matters twice as much as PV" is something we can
 * see rather than guess at.
 *
 * Trained by plain SGD on self-play outcomes: every position visited during a
 * game is labelled with that game's result (1 win / 0 loss / ½ draw).
 */
import { FEATURE_COUNT, FEATURE_NAMES, FeatureVector } from './features.js';

export interface TrainingSample {
  features: FeatureVector;
  /** 1 win, 0 loss, 0.5 draw — from the perspective the features were taken. */
  label: number;
  /** Later positions predict the outcome better; weight them more. */
  weight?: number;
}

export class ValueModel {
  constructor(public weights: number[] = new Array(FEATURE_COUNT).fill(0)) {}

  /** P(win) for a feature vector. */
  predict(f: FeatureVector): number {
    let z = 0;
    for (let i = 0; i < this.weights.length; i++) z += this.weights[i] * f[i];
    // Clamp before exp to avoid Infinity on wild early weights.
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  }

  /**
   * Fit by SGD with L2 regularisation. Returns the final mean log-loss, which
   * is what tells us whether the model learned anything at all.
   */
  fit(samples: TrainingSample[], opts: { epochs?: number; lr?: number; l2?: number } = {}): number {
    const epochs = opts.epochs ?? 30;
    const lr0 = opts.lr ?? 0.5;
    const l2 = opts.l2 ?? 1e-4;
    if (samples.length === 0) return NaN;

    const order = samples.map((_, i) => i);
    let loss = NaN;
    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle each epoch (deterministic given the caller's seeded rng).
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const lr = lr0 / (1 + epoch * 0.15); // simple decay
      let total = 0, totalW = 0;
      for (const idx of order) {
        const s = samples[idx];
        const w = s.weight ?? 1;
        const p = this.predict(s.features);
        const err = p - s.label;
        for (let i = 0; i < this.weights.length; i++) {
          this.weights[i] -= lr * w * (err * s.features[i] + l2 * this.weights[i]);
        }
        const clamped = Math.min(1 - 1e-9, Math.max(1e-9, p));
        total += -w * (s.label * Math.log(clamped) + (1 - s.label) * Math.log(1 - clamped));
        totalW += w;
      }
      loss = total / Math.max(1, totalW);
    }
    return loss;
  }

  /** Human-readable weights, largest influence first — the design read-out. */
  describe(): string {
    return this.weights
      .map((w, i) => ({ name: FEATURE_NAMES[i], w }))
      .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
      .map(({ name, w }) => `  ${name.padEnd(16)} ${w >= 0 ? '+' : ''}${w.toFixed(3)}`)
      .join('\n');
  }

  toJSON(): number[] { return [...this.weights]; }
  static fromJSON(weights: number[]): ValueModel { return new ValueModel([...weights]); }
}

/**
 * A sane starting point so the very first search isn't blind: PV differential
 * and action economy, the two things that obviously matter. Self-play training
 * replaces these.
 */
export function seedModel(): ValueModel {
  const w = new Array(FEATURE_COUNT).fill(0);
  const set = (name: (typeof FEATURE_NAMES)[number], v: number) => {
    w[FEATURE_NAMES.indexOf(name)] = v;
  };
  set('pvFracDiff', 4);
  set('bodyDiff', 3);
  set('totalPvRatio', 2);
  set('nearDeadThem', 1);
  set('nearDeadUs', -1);
  return new ValueModel(w);
}
