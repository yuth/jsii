import * as assert from 'assert';

/**
 * A sequence of integers.
 */
export class Sequence {
  private readonly stride: number;
  private nextValue: number;

  /**
   * Initializes a new sequence.
   *
   * @param origin the initial value in this sequence.
   * @param stride the stride of this sequence.
   */
  public constructor(origin = 10000, stride = 1) {
    assert(
      origin >= 0 && Number.isInteger(origin),
      `Invalid initialValue ${origin}. It must be an integer >= 0.`,
    );
    assert(
      stride > 0 && Number.isInteger(stride),
      `Invalid increment ${stride}. It must be an integer > 0.`,
    );

    this.stride = stride;
    this.nextValue = origin;
  }

  /**
   * @returns the next number in this sequence.
   */
  public next(): number {
    const result = this.nextValue;
    this.nextValue += this.stride;
    return result;
  }
}
